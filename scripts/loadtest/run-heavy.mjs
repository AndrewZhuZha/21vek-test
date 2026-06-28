#!/usr/bin/env node
/**
 * Локальный нагрузочный прогон (без k6): имитация thundering herd.
 * Usage: LOADTEST_CONCURRENCY=3000 node scripts/loadtest/run-heavy.mjs
 */
const portalUrl = (process.env.PORTAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const concurrency = Number(process.env.LOADTEST_CONCURRENCY || 3000);
const timeoutMs = Number(process.env.LOADTEST_TIMEOUT_MS || 15000);

const paths = [
    '/',
    '/wiki/',
    '/css/portal.bundle.css',
    '/css/wiki.bundle.css',
    '/js/config.js',
    '/js/auth/index.js',
    '/js/app.js',
    '/js/search-index-loader.js',
    '/assets/favicon.svg',
    '/api/health',
    '/api/auth/config-check',
    '/api/auth/me',
    '/api/wiki/config-check'
];

async function fetchOne(path) {
    const started = performance.now();
    try {
        const response = await fetch(`${portalUrl}${path}`, {
            headers: { Accept: '*/*' },
            signal: AbortSignal.timeout(timeoutMs)
        });
        return {
            path,
            status: response.status,
            ms: performance.now() - started,
            ok: response.ok || response.status === 401 || response.status === 304
        };
    } catch (error) {
        return {
            path,
            status: 0,
            ms: performance.now() - started,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main() {
    console.log(`Heavy load: ${portalUrl}, concurrency=${concurrency}, paths=${paths.length}`);
    const started = performance.now();

    const tasks = [];
    for (let i = 0; i < concurrency; i += 1) {
        tasks.push(fetchOne(paths[i % paths.length]));
    }
    const results = await Promise.all(tasks);

    const durations = results.map((item) => item.ms);
    const failed = results.filter((item) => !item.ok).length;
    const rateLimited = results.filter((item) => item.status === 429).length;
    const byStatus = {};
    for (const item of results) {
        const key = String(item.status);
        byStatus[key] = (byStatus[key] || 0) + 1;
    }

    const summary = {
        total: results.length,
        elapsedMs: Number((performance.now() - started).toFixed(1)),
        failed,
        failRatePct: Number(((failed / results.length) * 100).toFixed(2)),
        rateLimited,
        rateLimitedPct: Number(((rateLimited / results.length) * 100).toFixed(2)),
        p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
        p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
        p99Ms: Number(percentile(durations, 0.99).toFixed(1)),
        maxMs: Number(Math.max(...durations).toFixed(1)),
        byStatus
    };

    console.log(JSON.stringify(summary, null, 2));

    const ok = failed <= Math.ceil(concurrency * 0.01) && rateLimited <= Math.ceil(concurrency * 0.01);
    process.exit(ok ? 0 : 1);
}

main();
