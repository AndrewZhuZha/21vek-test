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

function positiveIntEnv(name, fallback) {
    const raw = Number(optionalEnv(name, String(fallback)));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function sampleRateEnv(name, fallback) {
    const raw = Number(optionalEnv(name, String(fallback)));
    if (!Number.isFinite(raw)) {
        return fallback;
    }
    if (raw <= 0) {
        return 0;
    }
    if (raw >= 1) {
        return 1;
    }
    return raw;
}

const publicUrl = optionalEnv('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
const port = Number(optionalEnv('PORT', '3000'));
const wikiCacheTtlRaw = Number(optionalEnv('YANDEX_WIKI_CACHE_TTL_SEC', '300'));
const wikiCacheTtlSec = Number.isFinite(wikiCacheTtlRaw) && wikiCacheTtlRaw > 0
    ? Math.floor(wikiCacheTtlRaw)
    : 300;
const wikiTreeCacheTtlRaw = Number(optionalEnv('YANDEX_WIKI_TREE_CACHE_TTL_SEC', String(wikiCacheTtlSec)));
const wikiTreeCacheTtlSec = Number.isFinite(wikiTreeCacheTtlRaw) && wikiTreeCacheTtlRaw > 0
    ? Math.floor(wikiTreeCacheTtlRaw)
    : wikiCacheTtlSec;
const wikiPageCacheTtlRaw = Number(optionalEnv('YANDEX_WIKI_PAGE_CACHE_TTL_SEC', String(wikiCacheTtlSec)));
const wikiPageCacheTtlSec = Number.isFinite(wikiPageCacheTtlRaw) && wikiPageCacheTtlRaw > 0
    ? Math.floor(wikiPageCacheTtlRaw)
    : wikiCacheTtlSec;
const wikiSearchCacheTtlRaw = Number(optionalEnv('YANDEX_WIKI_SEARCH_CACHE_TTL_SEC', String(wikiCacheTtlSec)));
const wikiSearchCacheTtlSec = Number.isFinite(wikiSearchCacheTtlRaw) && wikiSearchCacheTtlRaw > 0
    ? Math.floor(wikiSearchCacheTtlRaw)
    : wikiCacheTtlSec;
const wikiRequestTimeoutRaw = Number(optionalEnv('YANDEX_WIKI_REQUEST_TIMEOUT_MS', '15000'));
const wikiRequestTimeoutMs = Number.isFinite(wikiRequestTimeoutRaw) && wikiRequestTimeoutRaw > 0
    ? Math.floor(wikiRequestTimeoutRaw)
    : 15000;
const wikiMaxResponseBytesRaw = Number(optionalEnv('YANDEX_WIKI_MAX_RESPONSE_BYTES', String(5 * 1024 * 1024)));
const wikiMaxResponseBytes = Number.isFinite(wikiMaxResponseBytesRaw) && wikiMaxResponseBytesRaw > 1024
    ? Math.floor(wikiMaxResponseBytesRaw)
    : 5 * 1024 * 1024;
const wikiMaxAssetBytesRaw = Number(optionalEnv('YANDEX_WIKI_MAX_ASSET_BYTES', String(8 * 1024 * 1024)));
const wikiMaxAssetBytes = Number.isFinite(wikiMaxAssetBytesRaw) && wikiMaxAssetBytesRaw > 1024
    ? Math.floor(wikiMaxAssetBytesRaw)
    : 8 * 1024 * 1024;
const wikiDescendantsMaxRaw = Number(optionalEnv('YANDEX_WIKI_DESCENDANTS_MAX', '500'));
const wikiDescendantsMax = Number.isFinite(wikiDescendantsMaxRaw) && wikiDescendantsMaxRaw > 0
    ? Math.floor(wikiDescendantsMaxRaw)
    : 500;
const wikiTransformTimeoutRaw = Number(optionalEnv('YANDEX_WIKI_TRANSFORM_TIMEOUT_MS', '8000'));
const wikiTransformTimeoutMs = Number.isFinite(wikiTransformTimeoutRaw) && wikiTransformTimeoutRaw > 0
    ? Math.floor(wikiTransformTimeoutRaw)
    : 8000;
const wikiTransformMaxInputRaw = Number(optionalEnv('YANDEX_WIKI_TRANSFORM_MAX_INPUT_CHARS', '500000'));
const wikiTransformMaxInputChars = Number.isFinite(wikiTransformMaxInputRaw) && wikiTransformMaxInputRaw > 1000
    ? Math.floor(wikiTransformMaxInputRaw)
    : 500000;
const sessionMaxAgeDaysRaw = Number(optionalEnv('SESSION_MAX_AGE_DAYS', '7'));
const sessionMaxAgeDays = Number.isFinite(sessionMaxAgeDaysRaw) && sessionMaxAgeDaysRaw > 0
    ? Math.floor(sessionMaxAgeDaysRaw)
    : 7;
const defaultWikiBaseSlug = 'homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov';
const defaultWikiExternalUrl = `https://wiki.yandex.ru/${defaultWikiBaseSlug}`;
const rateLimitScaleMode = optionalEnv('RATE_LIMIT_SCALE_MODE', 'false').toLowerCase() === 'true';

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
    /** Отложить Directory lookup из OAuth callback на GET /api/auth/me (scale mode). */
    yandex360DeferDirectory: optionalEnv('YANDEX360_DEFER_DIRECTORY', 'false').toLowerCase() === 'true',
    /** ID организации Yandex 360. Если пусто — определяется через /directory/v1/org. */
    yandex360OrgId: optionalEnv('YANDEX360_ORG_ID', ''),
    /** memory | redis */
    sessionStore: optionalEnv('SESSION_STORE', 'memory').toLowerCase(),
    sessionRedisUrl: optionalEnv('SESSION_REDIS_URL', ''),
    sessionMaxAgeMs: sessionMaxAgeDays * 24 * 60 * 60 * 1000,
    requestLogging: optionalEnv('REQUEST_LOGGING', 'true').toLowerCase() !== 'false',
    /** 0..1: доля HTTP-запросов в лог (1 = все). При scale mode рекомендуется 0.01. */
    requestLogSampleRate: sampleRateEnv('REQUEST_LOG_SAMPLE_RATE', 1),
    rateLimitScaleMode,
    rateLimitAuthMeMax: positiveIntEnv('RATE_LIMIT_AUTH_ME_MAX', 120),
    rateLimitAuthConfigCheckMax: positiveIntEnv('RATE_LIMIT_AUTH_CONFIG_CHECK_MAX', 300),
    rateLimitWikiIpMax: positiveIntEnv('RATE_LIMIT_WIKI_IP_MAX', 600),
    rateLimitWikiSessionMax: positiveIntEnv('RATE_LIMIT_WIKI_SESSION_MAX', 300),
    rateLimitHealthMax: positiveIntEnv('RATE_LIMIT_HEALTH_MAX', 3600),
    yandexWikiEnabled: optionalEnv('YANDEX_WIKI_ENABLED', 'false').toLowerCase() === 'true',
    yandexWikiOAuthToken: optionalEnv('YANDEX_WIKI_OAUTH_TOKEN', ''),
    yandexWikiOrgId: optionalEnv('YANDEX_WIKI_ORG_ID', ''),
    yandexWikiBaseSlug: optionalEnv('YANDEX_WIKI_BASE_SLUG', defaultWikiBaseSlug)
        .replace(/^\/+/, '')
        .replace(/\/+$/, ''),
    /** Отображаемое название корневого раздела Wiki (хлебные крошки, меню). */
    yandexWikiBaseTitle: optionalEnv('YANDEX_WIKI_BASE_TITLE', ''),
    yandexWikiCacheTtlSec: wikiCacheTtlSec,
    yandexWikiTreeCacheTtlSec: wikiTreeCacheTtlSec,
    yandexWikiPageCacheTtlSec: wikiPageCacheTtlSec,
    yandexWikiSearchCacheTtlSec: wikiSearchCacheTtlSec,
    yandexWikiRequestTimeoutMs: wikiRequestTimeoutMs,
    yandexWikiMaxResponseBytes: wikiMaxResponseBytes,
    yandexWikiMaxAssetBytes: wikiMaxAssetBytes,
    yandexWikiDescendantsMax: wikiDescendantsMax,
    yandexWikiTransformTimeoutMs: wikiTransformTimeoutMs,
    yandexWikiTransformMaxInputChars: wikiTransformMaxInputChars,
    yandexWikiExternalUrl: optionalEnv('YANDEX_WIKI_EXTERNAL_URL', defaultWikiExternalUrl),
    /** Dev/ops: GET /api/wiki/audit (полный scan). По умолчанию выключен. */
    yandexWikiAuditEnabled: optionalEnv('YANDEX_WIKI_AUDIT_ENABLED', 'false').toLowerCase() === 'true',
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
        if (config.yandexWikiEnabled && !config.yandexWikiOAuthToken) {
            console.warn(
                'YANDEX_WIKI_ENABLED=true без YANDEX_WIKI_OAUTH_TOKEN (dev): в production service token обязателен'
            );
        }
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

    if (config.rateLimitScaleMode && config.sessionStore === 'memory') {
        throw new Error(
            'RATE_LIMIT_SCALE_MODE=true требует SESSION_STORE=redis (несколько инстансов portal)'
        );
    }

    if (config.sessionStore === 'memory') {
        console.warn('SESSION_STORE=memory в production: сессии не переживают перезапуск и не подходят для нескольких инстансов');
    }

    if (config.yandexWikiEnabled && !config.yandexWikiOAuthToken) {
        throw new Error(
            'YANDEX_WIKI_ENABLED=true в production требует YANDEX_WIKI_OAUTH_TOKEN (service token). См. docs/guides/WIKI-SETUP.md и docs/SECURITY.md'
        );
    }

    if (!config.trackerDemoMode) {
        throw new Error(
            'TRACKER_DEMO_MODE=false не поддерживается: интеграция с production Tracker API не реализована'
        );
    }

    if (config.yandexWikiEnabled && !isWikiApiConfigured()) {
        throw new Error(
            'YANDEX_WIKI_ENABLED=true, но отсутствует часть параметров Wiki API (токен/orgId/baseSlug). См. docs/guides/WIKI-SETUP.md'
        );
    }

    console.warn('TRACKER_DEMO_MODE=true в production — заявки остаются в demo-режиме');
}

export function isWikiApiConfigured() {
    if (!config.yandexWikiEnabled || !(config.yandexWikiOrgId || config.yandex360OrgId) || !config.yandexWikiBaseSlug) {
        return false;
    }
    if (config.yandexWikiOAuthToken) {
        return true;
    }
    return Boolean(config.yandexClientId);
}

export function getSessionCookieOptions() {
    return {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/'
    };
}
