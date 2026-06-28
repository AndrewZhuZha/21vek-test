/**
 * Диагностика Wiki API: страница + вложения + download_by_url.
 * Использование:
 *   node backend/scripts/wiki-probe.mjs <slug> [oauth_token]
 */
import 'dotenv/config';
import { yandexFetch, yandexFetchBinary } from '../src/auth/yandexFetch.js';

const WIKI_API_BASE = 'https://api.wiki.yandex.net/v1';
const slug = process.argv[2] || process.env.YANDEX_WIKI_BASE_SLUG;
const token = String(process.argv[3] || process.env.YANDEX_WIKI_OAUTH_TOKEN || '').trim();
const orgId = process.env.YANDEX_WIKI_ORG_ID || process.env.YANDEX360_ORG_ID || '';

if (!slug || !token || !orgId) {
    console.error('Usage: node backend/scripts/wiki-probe.mjs <slug> [oauth_token]');
    console.error('Need YANDEX_WIKI_ORG_ID and OAuth token in env or argv.');
    console.error('Token: oauth.yandex.ru → приложение → Debug token → scope wiki:read');
    process.exit(1);
}

if (!/^[\x21-\x7E]+$/.test(token)) {
    console.error('Invalid OAuth token: use ASCII token from oauth.yandex.ru Debug (not placeholder text).');
    process.exit(1);
}

const headers = {
    Authorization: `OAuth ${token}`,
    'X-Org-Id': orgId,
    Accept: 'application/json'
};

function normalizeResourcesList(payload) {
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.resources)) return payload.resources;
    return [];
}

const pageUrl = `${WIKI_API_BASE}/pages?slug=${encodeURIComponent(slug)}&fields=content`;
const pageRes = await yandexFetch(pageUrl, { headers });
const page = await pageRes.json();
console.log('Page status:', pageRes.status, 'id:', page?.id, 'title:', page?.title);

const attachmentsUrl = `${WIKI_API_BASE}/pages/${page.id}/attachments?page_size=20`;
const attachmentsRes = await yandexFetch(attachmentsUrl, { headers });
const attachmentsPayload = await attachmentsRes.json();
const attachments = Array.isArray(attachmentsPayload?.results) ? attachmentsPayload.results : [];
console.log('Attachments status:', attachmentsRes.status, 'count:', attachments.length);

for (const item of attachments.slice(0, 5)) {
    console.log('-', item?.name, '| url:', String(item?.download_url || '').slice(0, 80));
}

const resourcesUrl = `${WIKI_API_BASE}/pages/${page.id}/resources?types=attachment&page_size=20`;
const resourcesRes = await yandexFetch(resourcesUrl, { headers });
const resourcesPayload = await resourcesRes.json();
const resources = normalizeResourcesList(resourcesPayload);
console.log('Resources status:', resourcesRes.status, 'count:', resources.length);

const filesMatch = String(page?.content || '').match(/\/[\w\-/.]+\/\.files\/[^)\s"'<>]+/i);
if (filesMatch) {
    const filesPath = filesMatch[0].replace(/^\/+/, '');
    const downloadByUrl = `${WIKI_API_BASE}/pages/attachments/download_by_url?${new URLSearchParams({
        url: filesPath,
        download: 'true'
    }).toString()}`;
    console.log('download_by_url path:', filesPath);
    const bin = await yandexFetchBinary(downloadByUrl, {
        headers: { ...headers, Accept: '*/*' }
    });
    console.log('download_by_url test ->', bin.status, 'bytes:', bin.buffer?.length || 0, 'type:', bin.contentType || '');
}

const first = attachments[0] || resources.find((r) => r?.type === 'attachment')?.item;
if (first?.download_url) {
    const bin = await yandexFetchBinary(first.download_url, { headers: { ...headers, Accept: '*/*' } });
    console.log('Download test:', first.name, '->', bin.status, 'bytes:', bin.buffer?.length || 0);
}
