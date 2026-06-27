import { Router } from 'express';
import { config, assertOAuthConfigured } from '../config.js';
import { clearSessionUser, setSessionUser } from '../session.js';
import { domainRejectionMessage, isAllowedEmail } from '../auth/domain.js';
import { requireSameOrigin } from '../middleware/csrf.js';
import {
    authCallbackLimiter,
    authLoginLimiter,
    authLogoutLimiter
} from '../middleware/rateLimit.js';
import {
    buildAuthorizeUrl,
    createOAuthState,
    exchangeCodeForToken,
    fetchUserInfo,
    normalizeUserProfile
} from '../auth/yandex.js';

export const authRouter = Router();

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
        res.redirect(`/?auth_error=${encodeURIComponent(message)}`);
        return;
    }

    if (!code || typeof code !== 'string') {
        res.redirect('/?auth_error=missing_code');
        return;
    }

    if (!state || state !== req.session.oauthState) {
        res.redirect('/?auth_error=invalid_state');
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
                res.redirect(`/?auth_error=${encodeURIComponent(domainRejectionMessage(user.email))}`);
            });
            return;
        }

        setSessionUser(req.session, user);
        req.session.save((saveError) => {
            if (saveError) {
                res.redirect('/?auth_error=session_save_failed');
                return;
            }
            res.redirect('/');
        });
    } catch (callbackError) {
        const message = callbackError instanceof Error ? callbackError.message : 'oauth_callback_failed';
        res.redirect(`/?auth_error=${encodeURIComponent(message)}`);
    }
});

authRouter.get('/me', (req, res) => {
    if (!req.session.user) {
        res.status(401).json({ message: 'Требуется авторизация' });
        return;
    }
    res.json(req.session.user);
});

authRouter.post('/logout', authLogoutLimiter, requireSameOrigin, (req, res) => {
    req.session.destroy((destroyError) => {
        if (destroyError) {
            res.status(500).json({ message: 'Не удалось завершить сессию' });
            return;
        }
        res.clearCookie('portal.sid');
        res.json({ ok: true });
    });
});

authRouter.get('/config-check', (_req, res) => {
    const configured = Boolean(config.yandexClientId && config.yandexClientSecret);
    if (config.isProduction) {
        res.json({ configured });
        return;
    }
    res.json({
        configured,
        redirectUri: config.redirectUri,
        allowedEmailDomain: config.allowedEmailDomain
    });
});
