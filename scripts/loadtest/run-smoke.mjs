#!/usr/bin/env node
/**
 * Простой нагрузочный smoke без k6 (для локальной проверки).
 * Usage: node scripts/loadtest/run-smoke.mjs [PORTAL_URL]
 */
const portalUrl = (process.argv[2] || process.env.PORTAL_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const concurrency = Number(process.env.LOADTEST_CONCURRENCY || 100);
const paths = ['/', '/api/health', '/api/auth/config-check', '/css/portal.bundle.css'];

async function fetchOne(path) {
    const started = performance.now();
    try {
        const response = await fetch(`${portalUrl}${path}`, {
            headers: { Accept: '*/*' },
            signal: AbortSignal.timeout(10000)
        });
        return {
            path,
            status: response.status,
            ms: performance.now() - started,
            ok: response.ok || response.status === 401
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

async function main() {
    console.log(`Load smoke: ${portalUrl}, concurrency=${concurrency}`);
    const tasks = [];
    for (let i = 0; i < concurrency; i += 1) {
        const path = paths[i % paths.length];
        tasks.push(fetchOne(path));
    }
    const results = await Promise.all(tasks);
    const durations = results.map((item) => item.ms).sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const failed = results.filter((item) => !item.ok).length;
    const rateLimited = results.filter((item) => item.status === 429).length;

    console.log(JSON.stringify({
        total: results.length,
        failed,
        rateLimited,
        p95Ms: Number(p95.toFixed(1)),
        sample: results.slice(0, 5)
    }, null, 2));

    process.exit(failed > concurrency * 0.05 ? 1 : 0);
}

main();
