import { Router } from 'express';
import { config, assertOAuthConfigured, getSessionCookieOptions } from '../config.js';
import { clearSessionUser, setSessionUser } from '../session.js';
import { domainRejectionMessage, isAllowedEmail } from '../auth/domain.js';
import { requireSameOrigin } from '../middleware/csrf.js';
import {
    authCallbackLimiter,
    authConfigCheckLimiter,
    authLoginLimiter,
    authLogoutLimiter,
    authMeLimiter
} from '../middleware/rateLimit.js';
import { formatYandexOAuthError } from '../auth/yandexFetch.js';
import { enrichUserFromDirectory, getCachedDirectoryMeta } from '../auth/yandex360.js';
import {
    buildAuthorizeUrl,
    createOAuthState,
    exchangeCodeForToken,
    fetchUserInfo,
    normalizeUserProfile
} from '../auth/yandex.js';

export const authRouter = Router();

/**
 * @param {unknown} message
 * @returns {string}
 */
function sanitizeAuthErrorMessage(message) {
    const text = String(message || '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, 200);
    return text || 'auth_error';
}

/**
 * @param {string} message
 * @returns {void}
 */
function redirectAuthError(res, message) {
    res.redirect(`/?auth_error=${encodeURIComponent(sanitizeAuthErrorMessage(message))}`);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ displayName: string, email: string, login: string, avatarUrl: string | null, position?: string | null, department?: string | null }} user
 * @returns {void}
 */
function finalizeAuthenticatedSession(req, res, user) {
    req.session.regenerate((regenerateError) => {
        if (regenerateError) {
            redirectAuthError(res, 'session_save_failed');
            return;
        }

        setSessionUser(req.session, user);
        req.session.save((saveError) => {
            if (saveError) {
                redirectAuthError(res, 'session_save_failed');
                return;
            }
            res.redirect('/');
        });
    });
}

authRouter.get('/login', authLoginLimiter, (req, res) => {
    try {
        assertOAuthConfigured();
    } catch (error) {
        res.status(503).json({ message: error.message });
        return;
    }

    const state = createOAuthState();
    req.session.oauthState = state;
    req.session.save((saveError) => {
        if (saveError) {
            res.status(500).json({ message: 'Не удалось начать OAuth-сессию' });
            return;
        }
        res.redirect(buildAuthorizeUrl(state));
    });
});

authRouter.get('/callback', authCallbackLimiter, async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
        const message = typeof errorDescription === 'string' ? errorDescription : String(error);
        redirectAuthError(res, message);
        return;
    }

    if (!code || typeof code !== 'string') {
        redirectAuthError(res, 'missing_code');
        return;
    }

    if (!state || state !== req.session.oauthState) {
        redirectAuthError(res, 'invalid_state');
        return;
    }

    try {
        assertOAuthConfigured();
        const tokenData = await exchangeCodeForToken(code);
        const profile = await fetchUserInfo(tokenData.access_token);
        const user = normalizeUserProfile(profile);

        if (!isAllowedEmail(user.email)) {
            clearSessionUser(req.session);
            req.session.save(() => {
                redirectAuthError(res, domainRejectionMessage(user.email));
            });
            return;
        }

        const enrichedUser = await enrichUserFromDirectory(tokenData.access_token, user, {
            maxListPages: 15,
            timeoutMs: 15000
        });
        finalizeAuthenticatedSession(req, res, enrichedUser);
    } catch (callbackError) {
        console.error('OAuth callback:', callbackError);
        const message = formatYandexOAuthError(callbackError);
        redirectAuthError(res, message);
    }
});

authRouter.get('/me', authMeLimiter, (req, res) => {
    if (!req.session.user) {
        res.status(401).json({ message: 'Требуется авторизация' });
        return;
    }

    let user = req.session.user;
    if (!user.position) {
        const cachedMeta = getCachedDirectoryMeta(user.email);
        if (cachedMeta?.position) {
            user = {
                ...user,
                position: cachedMeta.position,
                department: cachedMeta.department || user.department || null
            };
            req.session.user = user;
        }
    }

    res.json(user);
});

authRouter.post('/logout', authLogoutLimiter, requireSameOrigin, (req, res) => {
    req.session.destroy((destroyError) => {
        if (destroyError) {
            res.status(500).json({ message: 'Не удалось завершить сессию' });
            return;
        }
        res.clearCookie('portal.sid', getSessionCookieOptions());
        res.json({ ok: true });
    });
});

authRouter.get('/config-check', authConfigCheckLimiter, (_req, res) => {
    const configured = Boolean(config.yandexClientId && config.yandexClientSecret);
    const payload = {
        configured,
        guestRequestTypes: config.guestRequestTypes,
        trackerDemoMode: config.trackerDemoMode,
        directoryEnabled: config.yandex360UseDirectory
    };

    if (config.isProduction) {
        res.json(payload);
        return;
    }

    res.json({
        ...payload,
        redirectUri: config.redirectUri,
        allowedEmailDomain: config.allowedEmailDomain
    });
});
