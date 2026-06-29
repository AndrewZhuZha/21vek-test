import { config } from '../config.js';
import { withWikiCache } from '../middleware/wikiCache.js';
import { getWikiTreeCacheKey } from './wikiCacheKeys.js';
import { normalizeWikiSlug, isSlugInBaseScope } from './wikiScope.js';
import { encodeWikiHashSlug } from './wikiMarkup.js';
import { createWikiError } from './wikiErrors.js';
import { getWikiConfigState, getWikiCacheTtl } from './wikiConfig.js';
import {
    slugToLabel,
    slugDepth,
    parentSlugOf,
    pickPageTitle,
    resolveWikiPageTitle,
    isLikelyFallbackTitle
} from './wikiTitles.js';
import { fetchPageBySlug, fetchDescendantsBySlug } from './wikiApiClient.js';

async function enrichPagesWithMetadata(pages, accessToken) {
    const list = Array.isArray(pages) ? pages.map((page) => ({ ...page })) : [];
    const targets = list.filter((page) => normalizeWikiSlug(page.slug) && (
        !String(page.title || '').trim()
        || isLikelyFallbackTitle(page.title, page.slug)
    ));
    if (!targets.length) {
        return list;
    }

    const concurrency = 4;
    for (let index = 0; index < targets.length; index += concurrency) {
        const batch = targets.slice(index, index + concurrency);
        await Promise.all(batch.map(async (page) => {
            const slug = normalizeWikiSlug(page.slug);
            try {
                const fetched = await fetchPageBySlug(slug, true, accessToken);
                page.content = fetched.content || page.content || '';
                const bestTitle = pickPageTitle(fetched.original || fetched, slug);
                page.title = resolveWikiPageTitle(
                    { ...page, ...fetched, title: bestTitle },
                    page.content
                );
                page.parentId = fetched.parentId ?? page.parentId;
                page.updatedAt = fetched.updatedAt ?? page.updatedAt;
                page.id = fetched.id ?? page.id;
            } catch {
                // keep slug-based fallback title
            }
        }));
    }

    return list;
}

function pageContentNeedsTreeMacro(content) {
    return /(?:\{%|\{\{)\s*-?\s*tree\b/i.test(String(content || ''));
}

function buildTreeItems(baseSlug, pages) {
    const normalizedBaseSlug = normalizeWikiSlug(baseSlug || config.yandexWikiBaseSlug);
    const pageList = (Array.isArray(pages) ? pages : [])
        .filter((page) => page && normalizeWikiSlug(page.slug));
    const bySlug = new Map(pageList.map((page) => [normalizeWikiSlug(page.slug), page]));
    const collator = new Intl.Collator('ru', { sensitivity: 'base' });

    const childrenByParentSlug = new Map();
    pageList.forEach((page) => {
        const slug = normalizeWikiSlug(page.slug);
        if (slug === normalizedBaseSlug) {
            return;
        }
        const directParent = parentSlugOf(slug);
        let parentSlug = normalizedBaseSlug;
        if (directParent && (bySlug.has(directParent) || directParent.startsWith(`${normalizedBaseSlug}/`) || directParent === normalizedBaseSlug)) {
            parentSlug = bySlug.has(directParent) ? directParent : normalizedBaseSlug;
        }
        if (!childrenByParentSlug.has(parentSlug)) {
            childrenByParentSlug.set(parentSlug, []);
        }
        childrenByParentSlug.get(parentSlug).push(page);
    });

    childrenByParentSlug.forEach((children) => {
        children.sort((a, b) => collator.compare(String(a.title || ''), String(b.title || '')));
    });

    const items = [];
    function walk(parentSlug, depth) {
        const children = childrenByParentSlug.get(parentSlug) || [];
        children.forEach((page) => {
            const slug = normalizeWikiSlug(page.slug);
            items.push({
                id: page.id,
                slug,
                title: resolveWikiPageTitle(page, page.content),
                parentId: page.parentId ?? null,
                parentSlug: parentSlugOf(slug) || null,
                updatedAt: page.updatedAt || null,
                depth,
                href: `/wiki/#/${encodeWikiHashSlug(slug)}`
            });
            walk(slug, depth + 1);
        });
    }

    walk(normalizedBaseSlug, 0);

    if (items.length) {
        return items;
    }

    const baseDepth = slugDepth(normalizedBaseSlug);
    return pageList
        .filter((page) => normalizeWikiSlug(page.slug) !== normalizedBaseSlug)
        .map((page) => ({
            id: page.id,
            slug: normalizeWikiSlug(page.slug),
            title: resolveWikiPageTitle(page, page.content),
            parentId: page.parentId ?? null,
            parentSlug: parentSlugOf(page.slug) || null,
            updatedAt: page.updatedAt || null,
            depth: Math.max(0, slugDepth(page.slug) - baseDepth),
            href: `/wiki/#/${encodeWikiHashSlug(page.slug)}`
        }))
        .sort((a, b) => {
            if (a.depth !== b.depth) {
                return a.depth - b.depth;
            }
            return collator.compare(a.title, b.title);
        });
}

async function getWikiTreePayload(accessToken) {
    const state = getWikiConfigState();
    if (!state.enabled) {
        return {
            ...state,
            items: []
        };
    }

    if (!state.configured) {
        throw createWikiError(503, 'Wiki API не настроен.');
    }

    const cacheKey = getWikiTreeCacheKey(accessToken, state.baseSlug);
    return withWikiCache(cacheKey, async () => {
        const { pages, truncated } = await fetchDescendantsBySlug(state.baseSlug, accessToken);
        const scopedPages = pages.filter((page) => isSlugInBaseScope(page.slug, state.baseSlug));
        const enrichedPages = await enrichPagesWithMetadata(scopedPages, accessToken);
        const items = buildTreeItems(state.baseSlug, enrichedPages);
        const normalizedBaseSlug = normalizeWikiSlug(state.baseSlug);
        const basePage = enrichedPages.find((page) => normalizeWikiSlug(page.slug) === normalizedBaseSlug);
        const configuredRootTitle = String(config.yandexWikiBaseTitle || '').trim();
        let rootTitle = configuredRootTitle || String(basePage?.title || '').trim();
        if (!rootTitle || isLikelyFallbackTitle(rootTitle, normalizedBaseSlug)) {
            try {
                const fetched = await fetchPageBySlug(normalizedBaseSlug, true, accessToken);
                rootTitle = resolveWikiPageTitle(fetched, fetched?.content || '');
            } catch {
                // keep list title
            }
        }
        if (!rootTitle || isLikelyFallbackTitle(rootTitle, normalizedBaseSlug)) {
            rootTitle = configuredRootTitle || slugToLabel(normalizedBaseSlug);
        }
        const titlesBySlug = {};
        enrichedPages.forEach((page) => {
            const pageSlug = normalizeWikiSlug(page.slug);
            const title = resolveWikiPageTitle(page, page.content);
            if (pageSlug && title) {
                titlesBySlug[pageSlug] = title;
            }
        });
        titlesBySlug[normalizedBaseSlug] = rootTitle;
        items.forEach((item) => {
            const itemSlug = normalizeWikiSlug(item.slug);
            if (itemSlug && titlesBySlug[itemSlug]) {
                item.title = titlesBySlug[itemSlug];
            }
        });
        return {
            ...state,
            items,
            truncated,
            rootTitle,
            titlesBySlug
        };
    }, getWikiCacheTtl('tree'));
}

export {
    enrichPagesWithMetadata,
    buildTreeItems,
    getWikiTreePayload,
    pageContentNeedsTreeMacro
};
