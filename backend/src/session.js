import session from 'express-session';
import { config } from './config.js';

/**
 * @param {import('express').Express} app
 */
export function setupSession(app) {
    app.set('trust proxy', 1);
    app.use(session({
        name: 'portal.sid',
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    }));
}

/**
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 * @param {{ displayName: string, email: string, login: string, avatarUrl: string | null }} user
 */
export function setSessionUser(sessionData, user) {
    sessionData.user = user;
    sessionData.oauthState = undefined;
}

/**
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 */
export function clearSessionUser(sessionData) {
    sessionData.user = undefined;
    sessionData.oauthState = undefined;
}
