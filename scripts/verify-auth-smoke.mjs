#!/usr/bin/env node
/**
 * Автоматические smoke-проверки auth API (без браузера).
 * Запуск: npm start (в другом терминале), затем node scripts/verify-auth-smoke.mjs
 */
import http from 'node:http';

const baseUrl = new URL(process.env.PORTAL_URL || 'http://localhost:3000');
const loopbackHosts = new Set(['localhost', '127.0.0.1']);

function isLoopbackRedirectMatch(actual, expected) {
    try {
        const actualUrl = new URL(actual);
        const expectedUrl = new URL(expected);
        return (
            actualUrl.protocol === expectedUrl.protocol &&
            actualUrl.port === expectedUrl.port &&
            actualUrl.pathname === expectedUrl.pathname &&
            loopbackHosts.has(actualUrl.hostname) &&
            loopbackHosts.has(expectedUrl.hostname)
        );
    } catch {
        return false;
    }
}

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
    check(
        health.body?.service === '21vek-it-portal' && health.body?.wiki === undefined,
        'GET /api/health не раскрывает wiki diagnostics'
    );
    check(
        typeof health.headers['x-request-id'] === 'string' && health.headers['x-request-id'].length >= 8,
        'GET /api/health возвращает X-Request-Id'
    );

    const config = await request('/api/auth/config-check');
    check(config.status === 200, 'GET /api/auth/config-check → 200');
    check(
        config.body && typeof config.body.configured === 'boolean',
        'config-check содержит configured'
    );
    check(
        Array.isArray(config.body?.guestRequestTypes),
        'config-check содержит guestRequestTypes'
    );
    check(
        typeof config.body?.trackerDemoMode === 'boolean',
        'config-check содержит trackerDemoMode'
    );
    check(
        !config.body?.redirectUri ||
        config.body?.redirectUri === `${baseUrl.origin}/api/auth/callback` ||
        isLoopbackRedirectMatch(config.body?.redirectUri, `${baseUrl.origin}/api/auth/callback`),
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

    const wikiConfig = await request('/api/wiki/config-check');
    check(wikiConfig.status === 200, 'GET /api/wiki/config-check → 200');
    check(
        typeof wikiConfig.body?.enabled === 'boolean' && typeof wikiConfig.body?.configured === 'boolean',
        'wiki config-check содержит enabled/configured'
    );
    check(
        typeof wikiConfig.body?.externalUrl === 'string' && wikiConfig.body.externalUrl.length > 0,
        'wiki config-check содержит externalUrl'
    );
    check(
        wikiConfig.body?.snapshot === undefined && wikiConfig.body?.cache === undefined,
        'wiki config-check не раскрывает snapshot/cache'
    );

    const blockedData = await request('/data/wiki-search.json');
    check(blockedData.status === 404, 'GET /data/wiki-search.json → 404 (не публичный)');

    const wikiTreeUnauth = await request('/api/wiki/tree');
    check(wikiTreeUnauth.status === 401, 'GET /api/wiki/tree без сессии → 401');

    const wikiPageUnauth = await request('/api/wiki/page?slug=homepage');
    check(wikiPageUnauth.status === 401, 'GET /api/wiki/page без сессии → 401');

    const wikiSearchUnauth = await request('/api/wiki/search?q=test');
    check(wikiSearchUnauth.status === 401, 'GET /api/wiki/search без сессии → 401');

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

    const resetUnauth = await request('/api/tracker/password-reset', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: baseUrl.origin
        },
        body: JSON.stringify({
            target: 'Тест',
            requester: 'Тест',
            reason: 'Smoke test'
        })
    });
    check(resetUnauth.status === 401, 'POST /api/tracker/password-reset без сессии → 401');

    const logoutLoopback = await request('/api/auth/logout', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Origin: 'http://127.0.0.1:3000'
        }
    });
    check(
        logoutLoopback.status === 200,
        'POST /api/auth/logout с Origin 127.0.0.1 → 200 (dev loopback CSRF)',
        logoutLoopback.body?.message || logoutLoopback.status
    );

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
    check(
        String(index.headers['cache-control'] || '').includes('no-store'),
        'GET / отдаёт Cache-Control: no-store'
    );

    const gateHtml = String(index.body || '');
    check(gateHtml.includes('portalAuthGate'), 'index.html содержит login gate');
    check(gateHtml.includes('/js/auth/index.js'), 'index.html подключает /js/auth/index.js');
    check(gateHtml.includes('name="description"'), 'index.html содержит meta description');
    check(gateHtml.includes('name="robots" content="noindex,nofollow"'), 'index.html содержит robots noindex');
    check(
        gateHtml.includes('rel="preconnect" href="https://avatars.yandex.net"'),
        'index.html содержит preconnect для avatars.yandex.net'
    );

    const wikiReader = await request('/wiki/');
    check(wikiReader.status === 200, 'GET /wiki/ → 200 (wiki reader)');
    check(
        String(wikiReader.headers['cache-control'] || '').includes('no-store'),
        'GET /wiki/ отдаёт Cache-Control: no-store'
    );
    const wikiHtml = String(wikiReader.body || '');
    check(wikiHtml.includes('id="wikiTree"'), 'wiki.html содержит контейнер дерева');
    check(wikiHtml.includes('/js/wiki/reader.js'), 'wiki.html подключает /js/wiki/reader.js');

    const wikiApiJs = await request('/js/wiki/api.js');
    check(wikiApiJs.status === 200, 'GET /js/wiki/api.js → 200');
    const wikiReaderJs = await request('/js/wiki/reader.js');
    check(wikiReaderJs.status === 200, 'GET /js/wiki/reader.js → 200');
    const wikiCss = await request('/css/wiki.bundle.css');
    check(wikiCss.status === 200, 'GET /css/wiki.bundle.css → 200');

    const robots = await request('/robots.txt');
    const robotsBody = String(robots.body || '');
    check(robots.status === 200, 'GET /robots.txt → 200');
    check(robotsBody.includes('Disallow: /'), 'robots.txt запрещает индексацию');

    const styleCss = await request('/css/portal.bundle.css');
    check(styleCss.status === 200, 'GET /css/portal.bundle.css → 200');
    check(
        String(styleCss.headers['cache-control'] || '').includes('max-age=3600'),
        'GET /css/portal.bundle.css отдаёт cache-control для статики'
    );

    const deepUnknown = await request('/qa/non-existent/path');
    const deepUnknownHtml = String(deepUnknown.body || '');
    check(deepUnknown.status === 404, 'GET /qa/non-existent/path → 404');
    check(deepUnknownHtml.includes('Страница не найдена'), '404-страница содержит заголовок ошибки');
    check(deepUnknownHtml.includes('/css/errors.css'), '404-страница использует абсолютные пути ассетов');

    const missingCss = await request('/css/not-found.css');
    check(missingCss.status === 404, 'GET /css/not-found.css → 404');
    check(String(missingCss.body || '').trim() === 'Not found', 'GET /css/not-found.css возвращает короткий текст 404');
    check(
        String(missingCss.headers['content-type'] || '').includes('text/plain'),
        'GET /css/not-found.css возвращает text/plain'
    );
} catch (error) {
    ok = false;
    console.error(`\n✗ Сервер недоступен (${baseUrl.origin}). Запустите: npm start\n`, error.message);
    process.exit(1);
}

console.log(ok ? '\n✓ Все автоматические проверки пройдены\n' : '\n✗ Есть ошибки\n');
console.log('Ручной чек-лист: docs/TESTING.md (вход @21vek.by, logout, FIO)\n');
process.exit(ok ? 0 : 1);
