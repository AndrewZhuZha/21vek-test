import session from 'express-session';
import { config, getSessionCookieOptions } from './config.js';
import { shouldPersistOAuthAccessToken } from './auth/sessionOAuth.js';

/**
 * @returns {Promise<session.Store | null>}
 */
async function createSessionStore() {
    if (config.sessionStore !== 'redis') {
        return null;
    }

    const [{ createClient }, { RedisStore }] = await Promise.all([
        import('redis'),
        import('connect-redis')
    ]);

    const redisClient = createClient({ url: config.sessionRedisUrl });
    redisClient.on('error', (error) => {
        console.error('Redis session store error:', error);
    });
    await redisClient.connect();
    return new RedisStore({
        client: redisClient,
        prefix: 'portal:sess:'
    });
}

/**
 * Сессия нужна только API-маршрутам — статика и HTML не трогают store.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function needsSession(req) {
    return String(req.path || '').startsWith('/api/');
}

/**
 * @param {import('express').Express} app
 */
export async function setupSession(app) {
    app.set('trust proxy', 1);
    const store = await createSessionStore();
    const options = {
        name: 'portal.sid',
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            ...getSessionCookieOptions(),
            maxAge: config.sessionMaxAgeMs
        }
    };

    if (store) {
        options.store = store;
        console.log('Session store: redis');
    }

    const sessionMiddleware = session(options);
    app.use((req, res, next) => {
        if (!needsSession(req)) {
            next();
            return;
        }
        sessionMiddleware(req, res, next);
    });
}

/**
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 * @param {{ displayName: string, email: string, login: string, avatarUrl: string | null, position?: string | null, department?: string | null }} user
 */
export function setSessionUser(sessionData, user, accessToken) {
    sessionData.user = user;
    sessionData.oauthState = undefined;
    if (accessToken && shouldPersistOAuthAccessToken()) {
        sessionData.accessToken = accessToken;
    } else {
        sessionData.accessToken = undefined;
    }
}

/**
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 */
export function clearSessionUser(sessionData) {
    sessionData.user = undefined;
    sessionData.oauthState = undefined;
    sessionData.accessToken = undefined;
}
