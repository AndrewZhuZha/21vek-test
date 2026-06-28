import { config } from '../config.js';

/**
 * Нужен ли OAuth access token в server-side session.
 * При service token для Wiki и без Directory — не храним.
 * @returns {boolean}
 */
export function shouldPersistOAuthAccessToken() {
    if (config.yandexWikiEnabled && !config.yandexWikiOAuthToken) {
        return true;
    }
    if (config.yandex360UseDirectory) {
        return true;
    }
    return false;
}

/**
 * Удаляет OAuth token из сессии, когда Wiki на service token и Directory уже не нужен.
 * @param {import('express-session').Session & Partial<import('express-session').SessionData>} sessionData
 * @param {{ position?: string | null } | null | undefined} user
 */
export function maybePurgeOAuthAccessTokenFromSession(sessionData, user) {
    if (!sessionData?.accessToken || !config.yandexWikiOAuthToken) {
        return;
    }
    if (config.yandex360UseDirectory && !user?.position) {
        return;
    }
    sessionData.accessToken = undefined;
}
