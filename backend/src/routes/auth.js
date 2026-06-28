import { Router } from 'express';
import { config, assertOAuthConfigured, getSessionCookieOptions } from '../config.js';
import { clearSessionUser, setSessionUser } from '../session.js';
import { isAllowedEmail } from '../auth/domain.js';
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
import { maybePurgeOAuthAccessTokenFromSession } from '../auth/sessionOAuth.js';
import {
    buildAuthorizeUrl,
    createOAuthState,
    exchangeCodeForToken,
    fetchUserInfo,
    normalizeUserProfile
} from '../auth/yandex.js';

export const authRouter = Router();

const ALLOWED_AUTH_ERROR_CODES = new Set([
    'auth_error',
    'missing_code',
    'invalid_state',
    'session_save_failed',
    'domain_rejected',
    'oauth_denied',
    'oauth_failed'
]);

/**
 * @param {unknown} code
 * @returns {string}
 */
function normalizeAuthErrorCode(code) {
    const normalized = String(code || 'auth_error')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .slice(0, 64);
    return ALLOWED_AUTH_ERROR_CODES.has(normalized) ? normalized : 'auth_error';
}

/**
 * @param {import('express').Response} res
 * @param {string} code
 */
function redirectAuthError(res, code) {
    res.redirect(`/?auth_error=${encodeURIComponent(normalizeAuthErrorCode(code))}`);
}

function sanitizeReturnTo(value) {
    const raw = String(value || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
        return '';
    }
    if (raw.startsWith('/api/')) {
        return '';
    }
    return raw.slice(0, 500);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ displayName: string, email: string, login: string, avatarUrl: string | null, position?: string | null, department?: string | null }} user
 * @returns {void}
 */
function finalizeAuthenticatedSession(req, res, user, accessToken) {
    const returnTo = sanitizeReturnTo(req.session?.oauthReturnTo);
    delete req.session.oauthReturnTo;

    req.session.regenerate((regenerateError) => {
        if (regenerateError) {
            redirectAuthError(res, 'session_save_failed');
            return;
        }

        setSessionUser(req.session, user, accessToken);
        req.session.save((saveError) => {
            if (saveError) {
                redirectAuthError(res, 'session_save_failed');
                return;
            }
            res.redirect(returnTo || '/');
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
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    if (returnTo) {
        req.session.oauthReturnTo = returnTo;
    }
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
        console.warn('OAuth provider error:', typeof errorDescription === 'string' ? errorDescription : String(error));
        redirectAuthError(res, 'oauth_denied');
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
                console.warn('OAuth domain rejected for login attempt.');
                redirectAuthError(res, 'domain_rejected');
            });
            return;
        }

        const shouldDeferDirectory = config.yandex360DeferDirectory || config.rateLimitScaleMode;
        if (shouldDeferDirectory) {
            finalizeAuthenticatedSession(req, res, user, tokenData.access_token);
            return;
        }

        const enrichedUser = await enrichUserFromDirectory(tokenData.access_token, user, {
            maxListPages: 15,
            timeoutMs: 15000
        });
        finalizeAuthenticatedSession(req, res, enrichedUser, tokenData.access_token);
    } catch (callbackError) {
        console.error('OAuth callback:', callbackError);
        formatYandexOAuthError(callbackError);
        redirectAuthError(res, 'oauth_failed');
    }
});

authRouter.get('/me', authMeLimiter, async (req, res) => {
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
        } else if (
            config.yandex360UseDirectory &&
            (config.yandex360DeferDirectory || config.rateLimitScaleMode) &&
            req.session.accessToken
        ) {
            try {
                const enrichedUser = await enrichUserFromDirectory(req.session.accessToken, user, {
                    maxListPages: 5,
                    timeoutMs: 8000
                });
                user = enrichedUser;
                req.session.user = user;
            } catch (directoryError) {
                console.warn(
                    'Directory lazy enrichment failed:',
                    directoryError instanceof Error ? directoryError.message : directoryError
                );
            }
        }
    }

    maybePurgeOAuthAccessTokenFromSession(req.session, user);

    res.json({
        ...user,
        wikiTokenReady: Boolean(req.session?.accessToken || config.yandexWikiOAuthToken)
    });
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
