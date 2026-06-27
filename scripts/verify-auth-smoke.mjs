#!/usr/bin/env node
/**
 * Автоматические smoke-проверки auth API (без браузера).
 * Запуск: npm start (в другом терминале), затем node scripts/verify-auth-smoke.mjs
 */
import http from 'node:http';

const baseUrl = new URL(process.env.PORTAL_URL || 'http://localhost:3000');

function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const body = options.body || null;
        const headers = { ...(options.headers || {}) };
        if (body && !headers['Content-Length']) {
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        const req = http.request(
            url,
            { method: options.method || 'GET', headers },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    let body = data;
                    if ((res.headers['content-type'] || '').includes('application/json') && data) {
                        try {
                            body = JSON.parse(data);
                        } catch {
                            // keep string
                        }
                    }
                    resolve({ status: res.statusCode, headers: res.headers, body });
                });
            }
        );
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

function pass(label) {
    console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
    console.log(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
    return false;
}

let ok = true;

function check(condition, label, detail) {
    if (condition) {
        pass(label);
    } else {
        ok = false;
        fail(label, detail);
    }
}

console.log(`\nAuth smoke tests → ${baseUrl}\n`);

try {
    const health = await request('/api/health');
    check(health.status === 200 && health.body?.ok === true, 'GET /api/health → 200 ok');

    const config = await request('/api/auth/config-check');
    check(config.status === 200, 'GET /api/auth/config-check → 200');
    check(
        config.body && typeof config.body.configured === 'boolean',
        'config-check содержит configured'
    );
    check(
        !config.body?.redirectUri || config.body?.redirectUri === `${baseUrl.origin}/api/auth/callback`,
        'redirectUri совпадает с PUBLIC_URL',
        config.body?.redirectUri
    );
    check(
        !config.body?.allowedEmailDomain || config.body?.allowedEmailDomain === '21vek.by',
        'allowedEmailDomain = 21vek.by',
        config.body?.allowedEmailDomain
    );

    const me = await request('/api/auth/me');
    check(me.status === 401, 'GET /api/auth/me без сессии → 401');

    const trackerUnauth = await request('/api/tracker/issues', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: baseUrl.origin
        },
        body: JSON.stringify({
            queue: 'ITHELP',
            summary: 'Smoke test',
            description: 'Smoke test payload',
            source: 'smoke-test',
            requestType: 'tech_support'
        })
    });
    check(trackerUnauth.status === 401, 'POST /api/tracker/issues без сессии → 401');

    const login = await request('/api/auth/login');
    if (config.body?.configured) {
        const location = login.headers.location || '';
        check(
            login.status === 302 && location.includes('oauth.yandex.ru'),
            'GET /api/auth/login → redirect на oauth.yandex.ru'
        );
    } else {
        check(login.status === 503, 'GET /api/auth/login без ключей → 503');
    }

    const index = await request('/');
    check(index.status === 200, 'GET / → 200 (статика)');

    const gateHtml = String(index.body || '');
    check(gateHtml.includes('portalAuthGate'), 'index.html содержит login gate');
    check(gateHtml.includes('js/auth/index.js'), 'index.html подключает auth/index.js');
} catch (error) {
    ok = false;
    console.error(`\n✗ Сервер недоступен (${baseUrl.origin}). Запустите: npm start\n`, error.message);
    process.exit(1);
}

console.log(ok ? '\n✓ Все автоматические проверки пройдены\n' : '\n✗ Есть ошибки\n');
console.log('Ручной чек-лист: docs/SMOKE-TESTS.md §10 (вход @21vek.by, logout, FIO)\n');
process.exit(ok ? 0 : 1);
