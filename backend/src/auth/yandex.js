import crypto from 'crypto';
import { config } from '../config.js';
import { yandexFetch } from './yandexFetch.js';

const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token';
const YANDEX_USERINFO_URL = 'https://login.yandex.ru/info';
const BASE_OAUTH_SCOPES = ['login:email', 'login:info', 'login:avatar'];
const DIRECTORY_OAUTH_SCOPES = [
    'directory:read_organization',
    'directory:read_users',
    'directory:read_departments'
];

function getOAuthScopes() {
    if (!config.yandex360UseDirectory) {
        return BASE_OAUTH_SCOPES;
    }
    return [...BASE_OAUTH_SCOPES, ...DIRECTORY_OAUTH_SCOPES];
}

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
        scope: getOAuthScopes().join(' '),
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

    const response = await yandexFetch(YANDEX_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        },
        body: body.toString()
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
    const response = await yandexFetch(`${YANDEX_USERINFO_URL}?format=json`, {
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
 * @param {unknown} avatarId
 * @param {boolean} [isAvatarEmpty]
 * @returns {string | null}
 */
export function buildYandexAvatarUrl(avatarId, isAvatarEmpty = false) {
    if (isAvatarEmpty) {
        return null;
    }

    const id = String(avatarId ?? '').trim();
    if (!id || id === '0/0-0') {
        return null;
    }

    // Yandex avatar id: "1234567890/abcdef0123456789"
    if (!/^[\w./-]+$/.test(id)) {
        return null;
    }

    return `https://avatars.yandex.net/get-yapic/${id}/islands-200`;
}

/**
 * @param {Record<string, unknown>} profile
 * @returns {{ displayName: string, email: string, login: string, avatarUrl: string | null, position: string | null, department: string | null }}
 */
export function normalizeUserProfile(profile) {
    const login = String(profile.login || profile.default_email || '').trim();
    const email = String(profile.default_email || profile.login || '').trim();
    const displayName = String(profile.real_name || profile.display_name || login || email).trim();
    const isAvatarEmpty = profile.is_avatar_empty === true;
    const avatarUrl = buildYandexAvatarUrl(profile.default_avatar_id, isAvatarEmpty);
    const position = String(profile.position || profile.job_title || profile.title || '').trim() || null;

    return {
        displayName,
        email,
        login,
        avatarUrl,
        position,
        department: null
    };
}
