#!/usr/bin/env node
import http from 'node:http';

const baseUrl = new URL(process.env.PORTAL_URL || 'http://localhost:3000');
const expectEnabled = String(process.env.WIKI_EXPECT_ENABLED || 'true').toLowerCase() !== 'false';

function request(pathname) {
    return new Promise((resolve, reject) => {
        const target = new URL(pathname, baseUrl);
        const req = http.request(target, { method: 'GET' }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let body = data;
                if ((res.headers['content-type'] || '').includes('application/json') && data) {
                    try {
                        body = JSON.parse(data);
                    } catch {
                        body = data;
                    }
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function main() {
    console.log(`Wiki smoke checks → ${baseUrl.origin}`);
    const configCheck = await request('/api/wiki/config-check');
    assert(configCheck.status === 200, 'GET /api/wiki/config-check must return 200');
    assert(typeof configCheck.body?.enabled === 'boolean', 'config-check must include enabled');
    assert(typeof configCheck.body?.configured === 'boolean', 'config-check must include configured');

    if (expectEnabled) {
        assert(configCheck.body.enabled === true, 'wiki must be enabled in verify:wiki mode');
        assert(configCheck.body.configured === true, 'wiki must be configured in verify:wiki mode');
        const snapshotCount = Number(configCheck.body?.snapshot?.count || 0);
        assert(snapshotCount > 0, 'wiki snapshot count must be > 0');
    }

    const wikiReader = await request('/wiki/');
    assert(wikiReader.status === 200, 'GET /wiki/ must return 200');
    assert(String(wikiReader.headers['cache-control'] || '').includes('no-store'), '/wiki/ must be no-store');

    const jsReader = await request('/js/wiki/reader.js');
    assert(jsReader.status === 200, 'GET /js/wiki/reader.js must return 200');

    const jsApi = await request('/js/wiki/api.js');
    assert(jsApi.status === 200, 'GET /js/wiki/api.js must return 200');

    const cssWiki = await request('/css/wiki.bundle.css');
    assert(cssWiki.status === 200, 'GET /css/wiki.bundle.css must return 200');

    const treeNoSession = await request('/api/wiki/tree');
    assert(treeNoSession.status === 401, 'GET /api/wiki/tree without session must return 401');

    const pageNoSession = await request('/api/wiki/page?slug=homepage');
    assert(pageNoSession.status === 401, 'GET /api/wiki/page without session must return 401');

    console.log('Wiki smoke checks passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
