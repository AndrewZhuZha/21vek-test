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
    isProduction: process.env.NODE_ENV === 'production',
    projectRoot: path.join(__dirname, '..', '..')
};

export function assertOAuthConfigured() {
    requireEnv('YANDEX_CLIENT_ID');
    requireEnv('YANDEX_CLIENT_SECRET');
    if (config.sessionSecret === 'dev-insecure-session-secret-change-me' && config.isProduction) {
        throw new Error('SESSION_SECRET должен быть задан в production');
    }
}
