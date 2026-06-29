import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { withWikiCache, getWikiCacheValue } from '../middleware/wikiCache.js';
import { getWikiSearchCacheKey, getWikiTreeCacheKey } from './wikiCacheKeys.js';
import { normalizeWikiSlug, isSlugInBaseScope } from './wikiScope.js';
import { encodeWikiHashSlug } from './wikiMarkup.js';
import { getWikiConfigState, getWikiCacheTtl, buildWikiExternalUrl } from './wikiConfig.js';
import { slugToLabel, splitSlug } from './wikiTitles.js';
import { getWikiTreePayload } from './wikiTree.js';

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}\s/_-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeSlug(slug) {
    return splitSlug(slug)
        .map((part) => part.replace(/[-_]+/g, ' '))
        .join(' ');
}

async function readWikiSearchSnapshot() {
    const snapshotPath = path.join(config.projectRoot, 'data', 'wiki-search.json');
    try {
        const raw = await readFile(snapshotPath, 'utf8');
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.items)
                ? parsed.items
                : [];
        return items
            .map((item) => {
                const slug = normalizeWikiSlug(item?.slug);
                if (!slug) {
                    return null;
                }
                return {
                    id: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
                    slug,
                    title: String(item?.title || slugToLabel(slug)).trim(),
                    corpus: String(item?.corpus || '').trim(),
                    updatedAt: item?.updatedAt || item?.updated_at || null
                };
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

async function getWikiSnapshotMeta() {
    const snapshotPath = path.join(config.projectRoot, 'data', 'wiki-search.json');
    try {
        const raw = await readFile(snapshotPath, 'utf8');
        const parsed = JSON.parse(raw);
        const generatedAt = String(parsed?.generatedAt || '').trim() || null;
        const count = Number.isFinite(Number(parsed?.count))
            ? Number(parsed.count)
            : (Array.isArray(parsed?.items) ? parsed.items.length : 0);
        const generatedAtTs = generatedAt ? Date.parse(generatedAt) : NaN;
        return {
            generatedAt,
            count: Math.max(0, count),
            ageSec: Number.isFinite(generatedAtTs)
                ? Math.max(0, Math.floor((Date.now() - generatedAtTs) / 1000))
                : null
        };
    } catch {
        return {
            generatedAt: null,
            count: 0,
            ageSec: null
        };
    }
}

async function loadSearchCandidates(accessToken, state) {
    const snapshotEntries = await readWikiSearchSnapshot();
    let candidates = snapshotEntries.filter((item) => isSlugInBaseScope(item.slug, state.baseSlug));
    if (candidates.length) {
        return candidates;
    }

    const treeCacheKey = getWikiTreeCacheKey(accessToken, state.baseSlug);
    const cachedTree = await getWikiCacheValue(treeCacheKey);
    const cachedItems = Array.isArray(cachedTree?.items) ? cachedTree.items : [];
    if (cachedItems.length) {
        return cachedItems.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            corpus: tokenizeSlug(item.slug),
            updatedAt: item.updatedAt
        }));
    }

    try {
        const treePayload = await getWikiTreePayload(accessToken);
        const items = Array.isArray(treePayload?.items) ? treePayload.items : [];
        return items.map((item) => ({
            id: item.id,
            slug: item.slug,
            title: item.title,
            corpus: tokenizeSlug(item.slug),
            updatedAt: item.updatedAt
        }));
    } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
            throw error;
        }
        console.warn('Wiki search: tree fallback unavailable:', error instanceof Error ? error.message : error);
        return [];
    }
}

async function searchWikiPages(query, limit = 20, accessToken) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery || normalizedQuery.length < 2) {
        return [];
    }

    const state = getWikiConfigState();
    if (!state.enabled || !state.configured) {
        return [];
    }

    const cappedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const cacheKey = getWikiSearchCacheKey(state.baseSlug, normalizedQuery, cappedLimit, accessToken);
    return withWikiCache(cacheKey, async () => {
        const candidates = await loadSearchCandidates(accessToken, state);

        const queryTokens = normalizedQuery.split(' ').filter(Boolean);
        const scored = candidates
            .map((item) => {
                const title = normalizeSearchText(item.title);
                const slugText = normalizeSearchText(String(item.slug || '').replace(/\//g, ' '));
                const corpus = normalizeSearchText(item.corpus || '');
                const haystack = `${title} ${slugText} ${corpus}`.trim();
                if (!haystack) {
                    return null;
                }

                let score = 0;
                if (title.includes(normalizedQuery)) score += 120;
                if (slugText.includes(normalizedQuery)) score += 90;
                if (corpus.includes(normalizedQuery)) score += 60;

                const allTokensMatched = queryTokens.every((token) => haystack.includes(token));
                if (allTokensMatched) {
                    score += 40;
                }

                return score > 0
                    ? {
                        id: item.id,
                        slug: item.slug,
                        title: String(item.title || slugToLabel(item.slug)).trim(),
                        corpus: item.corpus || '',
                        updatedAt: item.updatedAt || null,
                        href: `/wiki/#/${encodeWikiHashSlug(item.slug)}`,
                        editUrl: buildWikiExternalUrl(item.slug),
                        score
                    }
                    : null;
            })
            .filter(Boolean)
            .sort((a, b) => (
                b.score - a.score
                || String(a.title || '').localeCompare(String(b.title || ''), 'ru', { sensitivity: 'base' })
            ));

        return scored.slice(0, cappedLimit);
    }, getWikiCacheTtl('search'));
}

export {
    searchWikiPages,
    getWikiSnapshotMeta,
    readWikiSearchSnapshot,
    normalizeSearchText,
    tokenizeSlug
};
