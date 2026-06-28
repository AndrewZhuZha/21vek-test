import session from 'express-session';
import { config, getSessionCookieOptions } from './config.js';

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
        cookie: {
            ...getSessionCookieOptions(),
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    };

    if (store) {
        options.store = store;
        console.log('Session store: redis');
    }

    app.use(session(options));
}

/**
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 * @param {{ displayName: string, email: string, login: string, avatarUrl: string | null, position?: string | null, department?: string | null }} user
 */
export function setSessionUser(sessionData, user, accessToken) {
    sessionData.user = user;
    sessionData.oauthState = undefined;
    if (accessToken) {
        sessionData.accessToken = accessToken;
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
