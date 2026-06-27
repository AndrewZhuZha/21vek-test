import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function requireEnv(name) {
    const value = process.env[name];
    if (!value || !String(value).trim()) {
        throw new Error(`Переменная окружения ${name} не задана. См. backend/.env.example`);
    }
    return String(value).trim();
}

function optionalEnv(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === null || !String(value).trim()) {
        return fallback;
    }
    return String(value).trim();
}

function csvEnv(name) {
    return optionalEnv(name, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

const publicUrl = optionalEnv('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
const port = Number(optionalEnv('PORT', '3000'));

export const config = {
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    publicUrl,
    redirectUri: `${publicUrl}/api/auth/callback`,
    yandexClientId: optionalEnv('YANDEX_CLIENT_ID', ''),
    yandexClientSecret: optionalEnv('YANDEX_CLIENT_SECRET', ''),
    sessionSecret: optionalEnv('SESSION_SECRET', 'dev-insecure-session-secret-change-me'),
    allowedEmailDomain: optionalEnv('ALLOWED_EMAIL_DOMAIN', '21vek.by').toLowerCase(),
    guestRequestTypes: csvEnv('GUEST_REQUEST_TYPES'),
    trackerDemoMode: optionalEnv('TRACKER_DEMO_MODE', 'true').toLowerCase() !== 'false',
    /** Только dev/корп. прокси: отключить проверку TLS для oauth.yandex.ru и login.yandex.ru */
    yandexOAuthTlsInsecure: optionalEnv('YANDEX_OAUTH_TLS_INSECURE', 'false').toLowerCase() === 'true',
    /** Подтягивать должность из Yandex 360 Directory API после OAuth. */
    yandex360UseDirectory: optionalEnv('YANDEX360_USE_DIRECTORY', 'true').toLowerCase() !== 'false',
    /** ID организации Yandex 360. Если пусто — определяется через /directory/v1/org. */
    yandex360OrgId: optionalEnv('YANDEX360_ORG_ID', ''),
    /** memory | redis */
    sessionStore: optionalEnv('SESSION_STORE', 'memory').toLowerCase(),
    sessionRedisUrl: optionalEnv('SESSION_REDIS_URL', ''),
    requestLogging: optionalEnv('REQUEST_LOGGING', 'true').toLowerCase() !== 'false',
    isProduction: process.env.NODE_ENV === 'production',
    projectRoot: path.join(__dirname, '..', '..')
};

const DEV_SESSION_SECRET = 'dev-insecure-session-secret-change-me';

export function assertOAuthConfigured() {
    requireEnv('YANDEX_CLIENT_ID');
    requireEnv('YANDEX_CLIENT_SECRET');
}

/**
 * Блокирует небезопасный запуск в production.
 */
export function validateSecurityConfig() {
    if (!['memory', 'redis'].includes(config.sessionStore)) {
        throw new Error('SESSION_STORE должен быть memory или redis');
    }

    if (!config.isProduction) {
        return;
    }

    if (!config.sessionSecret || config.sessionSecret === DEV_SESSION_SECRET) {
        throw new Error('SESSION_SECRET должен быть задан в production (минимум 32 случайных байта)');
    }

    if (config.sessionSecret.length < 32) {
        throw new Error('SESSION_SECRET слишком короткий для production (минимум 32 символа)');
    }

    if (config.yandexOAuthTlsInsecure) {
        throw new Error(
            'YANDEX_OAUTH_TLS_INSECURE=true запрещён в production. Используйте NODE_EXTRA_CA_CERTS для корпоративного CA.'
        );
    }

    if (!config.publicUrl.startsWith('https://')) {
        throw new Error('PUBLIC_URL в production должен начинаться с https://');
    }

    if (config.sessionStore === 'redis' && !config.sessionRedisUrl) {
        throw new Error('SESSION_REDIS_URL обязателен, когда SESSION_STORE=redis');
    }

    if (config.sessionStore === 'memory') {
        console.warn('SESSION_STORE=memory в production: сессии не переживают перезапуск и не подходят для нескольких инстансов');
    }

    if (!config.trackerDemoMode) {
        throw new Error(
            'TRACKER_DEMO_MODE=false не поддерживается: интеграция с production Tracker API не реализована'
        );
    }

    console.warn('TRACKER_DEMO_MODE=true в production — заявки остаются в demo-режиме');
}

export function getSessionCookieOptions() {
    return {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax'
    };
}
