import crypto from 'crypto';
import { config } from '../config.js';

const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token';
const YANDEX_USERINFO_URL = 'https://login.yandex.ru/info';
const OAUTH_SCOPES = ['login:email', 'login:info', 'login:avatar'];

/**
 * @returns {string}
 */
export function createOAuthState() {
    return crypto.randomBytes(24).toString('hex');
}

/**
 * @returns {string}
 */
export function buildAuthorizeUrl(state) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.yandexClientId,
        redirect_uri: config.redirectUri,
        scope: OAUTH_SCOPES.join(' '),
        state
    });
    return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * @param {string} code
 * @returns {Promise<{ access_token: string }>}
 */
export async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.yandexClientId,
        client_secret: config.yandexClientSecret
    });

    const response = await fetch(YANDEX_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        },
        body
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data.error_description || data.error || `Token exchange failed (${response.status})`;
        throw new Error(message);
    }

    if (!data.access_token) {
        throw new Error('Yandex OAuth не вернул access_token');
    }

    return data;
}

/**
 * @param {string} accessToken
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchUserInfo(accessToken) {
    const response = await fetch(`${YANDEX_USERINFO_URL}?format=json`, {
        headers: {
            Authorization: `OAuth ${accessToken}`,
            Accept: 'application/json'
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data.message || data.error || `Userinfo failed (${response.status})`;
        throw new Error(message);
    }

    return data;
}

/**
 * @param {Record<string, unknown>} profile
 * @returns {{ displayName: string, email: string, login: string, avatarUrl: string | null }}
 */
export function normalizeUserProfile(profile) {
    const login = String(profile.login || profile.default_email || '').trim();
    const email = String(profile.default_email || profile.login || '').trim();
    const displayName = String(profile.real_name || profile.display_name || login || email).trim();
    const avatarId = profile.default_avatar_id;

    let avatarUrl = null;
    if (avatarId && typeof avatarId === 'string') {
        avatarUrl = `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`;
    }

    return {
        displayName,
        email,
        login,
        avatarUrl
    };
}
