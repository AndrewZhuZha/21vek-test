#!/usr/bin/env node
/**
 * Создаёт backend/.env из .env.example с SESSION_SECRET и выводит чек-лист OAuth.
 * Запуск: node scripts/setup-auth-env.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, 'backend', '.env');
const examplePath = path.join(root, 'backend', '.env.example');

const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
const redirectUri = `${publicUrl.replace(/\/$/, '')}/api/auth/callback`;

function generateSessionSecret() {
    return crypto.randomBytes(32).toString('hex');
}

function parseEnv(content) {
    const map = new Map();
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
    return map;
}

function buildEnv(map) {
    const order = [
        'YANDEX_CLIENT_ID',
        'YANDEX_CLIENT_SECRET',
        'SESSION_SECRET',
        'ALLOWED_EMAIL_DOMAIN',
        'TRACKER_DEMO_MODE',
        'GUEST_REQUEST_TYPES',
        'PORT',
        'PUBLIC_URL'
    ];
    const lines = [
        '# Сгенерировано scripts/setup-auth-env.mjs',
        '# Инструкция: docs/AUTH-SETUP.md',
        ''
    ];
    for (const key of order) {
        lines.push(`${key}=${map.get(key) ?? ''}`);
    }
    lines.push('');
    return lines.join('\n');
}

if (!fs.existsSync(examplePath)) {
    console.error('Не найден backend/.env.example');
    process.exit(1);
}

let existing = new Map();
if (fs.existsSync(envPath)) {
    existing = parseEnv(fs.readFileSync(envPath, 'utf8'));
    console.log('backend/.env уже существует — сохраняем YANDEX_* и SESSION_SECRET, обновляем остальное.\n');
}

const env = new Map(existing);
if (!env.get('SESSION_SECRET')) {
    env.set('SESSION_SECRET', generateSessionSecret());
}
if (!env.get('ALLOWED_EMAIL_DOMAIN')) {
    env.set('ALLOWED_EMAIL_DOMAIN', '21vek.by');
}
if (!env.get('TRACKER_DEMO_MODE')) {
    env.set('TRACKER_DEMO_MODE', 'true');
}
if (!env.has('GUEST_REQUEST_TYPES')) {
    env.set('GUEST_REQUEST_TYPES', '');
}
if (!env.get('PORT')) {
    env.set('PORT', '3000');
}
if (!env.get('PUBLIC_URL')) {
    env.set('PUBLIC_URL', publicUrl.replace(/\/$/, ''));
}

fs.writeFileSync(envPath, buildEnv(env), 'utf8');
console.log('✓ backend/.env создан/обновлён\n');

console.log('=== Регистрация OAuth на oauth.yandex.ru ===\n');
console.log('1. Войдите: https://oauth.yandex.ru/ (администратор Yandex 360)');
console.log('2. Создайте приложение типа «Веб-сервисы», название: ИТ-портал 21vek');
console.log('3. Redirect URI (добавьте оба при необходимости):');
console.log(`   Dev:  ${redirectUri}`);
console.log('   Prod: https://<ваш-домен-портала>/api/auth/callback');
console.log('4. Scopes: login:email, login:info, login:avatar');
console.log('5. Скопируйте Client ID и Client Secret в backend/.env\n');

const configured = Boolean(env.get('YANDEX_CLIENT_ID') && env.get('YANDEX_CLIENT_SECRET'));
if (configured) {
    console.log('✓ YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET уже заданы');
} else {
    console.log('⚠ Заполните YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET в backend/.env');
}

console.log('\nДальше: npm install && npm start');
console.log('Проверка: node scripts/verify-auth-smoke.mjs');
