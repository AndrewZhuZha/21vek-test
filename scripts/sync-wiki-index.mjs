import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const backendEnvPath = path.join(rootDir, 'backend', '.env');

const API_BASE = 'https://api.wiki.yandex.net/v1';
const DEFAULT_BASE_SLUG = 'homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov';
const OUTPUT_PATH = path.join(rootDir, 'data', 'wiki-search.json');
const PAGE_SIZE = 100;
const MAX_RESULTS = 500;

function normalizeSlug(value) {
    return String(value || '')
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function slugToWords(slug) {
    return normalizeSlug(slug)
        .split('/')
        .map((part) => part.replace(/[-_]+/g, ' '))
        .join(' ');
}

function titleFromSlug(slug) {
    const tail = normalizeSlug(slug).split('/').pop() || '';
    return tail.replace(/[-_]+/g, ' ').trim() || 'Без названия';
}

function buildHeaders(token, orgId) {
    return {
        Authorization: `OAuth ${token}`,
        'X-Org-Id': orgId,
        Accept: 'application/json'
    };
}

async function loadBackendEnv() {
    try {
        const raw = await readFile(backendEnvPath, 'utf8');
        raw.split(/\r?\n/g).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx <= 0) return;
            const key = trimmed.slice(0, eqIdx).trim();
            let value = trimmed.slice(eqIdx + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        });
    } catch {
        // backend/.env optional for local runs
    }
}

async function requestJson(pathname, params, headers) {
    const url = new URL(`${API_BASE}${pathname}`);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
        method: 'GET',
        headers
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const message = payload?.debug_message || payload?.message || `HTTP ${response.status}`;
        throw new Error(`Wiki API ${pathname} failed: ${message}`);
    }

    return payload;
}

async function writeFileAtomic(targetPath, content) {
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
}

async function loadExistingSearchFile() {
    try {
        const raw = await readFile(OUTPUT_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.items)) {
            return parsed.items;
        }
        return [];
    } catch {
        return [];
    }
}

async function fetchDescendants(baseSlug, headers) {
    const all = [];
    let cursor = '';
    let truncated = false;

    while (all.length < MAX_RESULTS) {
        const payload = await requestJson('/pages/descendants', {
            slug: baseSlug,
            include_self: 'true',
            page_size: PAGE_SIZE,
            cursor
        }, headers);

        const items = Array.isArray(payload?.results) ? payload.results : [];
        all.push(...items);
        cursor = String(payload?.next_cursor || '').trim();
        if (!cursor) break;
    }

    if (cursor) {
        truncated = true;
    }

    if (!all.length) {
        const root = await requestJson('/pages', { slug: baseSlug }, headers);
        if (root && typeof root === 'object') {
            all.push(root);
        }
    }

    return {
        items: all.slice(0, MAX_RESULTS),
        truncated
    };
}

const CORPUS_BODY_MAX = 2000;

function stripWikiMarkupForCorpus(raw) {
    return String(raw || '')
        .replace(/(?:\{%|\{\{)[\s\S]*?(?:%\}|\}\})/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#*_~`>\[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractBodyCorpus(page) {
    const content = page?.content || page?.body || '';
    if (!content) {
        return '';
    }
    return normalizeText(stripWikiMarkupForCorpus(content)).slice(0, CORPUS_BODY_MAX);
}

function mapPageToSearchEntry(page, previousBySlug) {
    const slug = normalizeSlug(page?.slug);
    if (!slug) return null;

    const title = String(page?.title || '').trim() || titleFromSlug(slug);
    const previous = previousBySlug.get(slug);
    const bodyCorpus = extractBodyCorpus(page);
    const generatedCorpus = normalizeText(`${title} ${slugToWords(slug)} ${bodyCorpus}`.trim());
    const previousCorpus = String(previous?.corpus || '').trim();
    const corpus = bodyCorpus
        ? generatedCorpus
        : (previousCorpus || generatedCorpus);

    return {
        id: Number.isFinite(Number(page?.id)) ? Number(page.id) : null,
        slug,
        title,
        corpus,
        updatedAt: String(page?.updated_at || page?.updatedAt || page?.modified_at || page?.modifiedAt || '').trim() || null
    };
}

async function main() {
    await loadBackendEnv();

    const wikiEnabled = String(process.env.YANDEX_WIKI_ENABLED || 'false').toLowerCase() === 'true';
    if (!wikiEnabled) {
        console.log('YANDEX_WIKI_ENABLED=false — обновление wiki-search.json пропущено.');
        process.exit(0);
    }

    const token = String(process.env.YANDEX_WIKI_OAUTH_TOKEN || '').trim();
    const orgId = String(process.env.YANDEX_WIKI_ORG_ID || process.env.YANDEX360_ORG_ID || '').trim();
    const baseSlug = normalizeSlug(process.env.YANDEX_WIKI_BASE_SLUG || DEFAULT_BASE_SLUG);
    if (!token) {
        throw new Error('YANDEX_WIKI_OAUTH_TOKEN не задан.');
    }
    if (!orgId) {
        throw new Error('YANDEX_WIKI_ORG_ID не задан (и отсутствует YANDEX360_ORG_ID).');
    }
    if (!baseSlug) {
        throw new Error('YANDEX_WIKI_BASE_SLUG не задан.');
    }

    const existingItems = await loadExistingSearchFile();
    const previousBySlug = new Map(
        existingItems
            .map((item) => [normalizeSlug(item?.slug), item])
            .filter(([slug]) => Boolean(slug))
    );

    const headers = buildHeaders(token, orgId);
    const minPagesRaw = Number(process.env.YANDEX_WIKI_MIN_PAGES || process.env.WIKI_INDEX_MIN_COUNT || '1');
    const minPages = Number.isFinite(minPagesRaw) && minPagesRaw > 0 ? Math.floor(minPagesRaw) : 1;

    const { items: pages, truncated } = await fetchDescendants(baseSlug, headers);
    const items = pages
        .map((page) => mapPageToSearchEntry(page, previousBySlug))
        .filter(Boolean)
        .sort((a, b) => a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }));

    if (items.length < minPages) {
        throw new Error(`Wiki index слишком маленький: pages=${items.length}, required>=${minPages}`);
    }

    const output = {
        generatedAt: new Date().toISOString(),
        baseSlug,
        source: 'yandex-wiki-api',
        count: items.length,
        truncated,
        items
    };

    await writeFileAtomic(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Wiki index updated: ${path.relative(rootDir, OUTPUT_PATH)} (pages: ${items.length})`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
