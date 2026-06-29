import { withWikiCache } from '../middleware/wikiCache.js';
import { getWikiPageCacheKey } from './wikiCacheKeys.js';
import { normalizeWikiSlug, assertWikiSlugInScope } from './wikiScope.js';
import { getWikiConfigState, getWikiCacheTtl, buildWikiExternalUrl } from './wikiConfig.js';
import { createWikiError } from './wikiErrors.js';
import { fetchPageBySlug } from './wikiApiClient.js';
import { resolveWikiPageTitle } from './wikiTitles.js';
import { renderWikiContent } from './wikiRender.js';
import { getWikiTreePayload, pageContentNeedsTreeMacro } from './wikiTree.js';

export { normalizeWikiSlug, assertWikiSlugInScope } from './wikiScope.js';
export { getWikiPageCacheKey, getWikiTreeCacheKey, getWikiAssetCacheKey } from './wikiCacheKeys.js';

export {
    resolveWikiPageTitle
} from './wikiTitles.js';

export {
    isWikiReaderEnabled,
    isWikiApiConfigured,
    getWikiConfigState,
    buildWikiExternalUrl
} from './wikiConfig.js';

export {
    fetchWikiPageBySlug
} from './wikiApiClient.js';

export {
    renderWikiContentForTest
} from './wikiRender.js';

export {
    getWikiTreePayload
} from './wikiTree.js';

export {
    searchWikiPages,
    getWikiSnapshotMeta,
    readWikiSearchSnapshot,
    normalizeSearchText,
    tokenizeSlug
} from './wikiSearch.js';

export {
    getWikiAssetCacheKeyForRequest,
    fetchWikiAssetBuffer
} from './wikiAssets.js';

export async function getWikiPagePayload(rawSlug, accessToken) {
    const state = getWikiConfigState();
    const slug = normalizeWikiSlug(rawSlug || state.baseSlug);
    if (!slug) {
        throw createWikiError(400, 'Slug страницы не указан.');
    }

    if (!state.enabled) {
        throw createWikiError(503, 'Wiki reader отключён.');
    }
    if (!state.configured) {
        throw createWikiError(503, 'Wiki API не настроен.');
    }
    assertWikiSlugInScope(slug, state.baseSlug);

    const cacheKey = getWikiPageCacheKey(slug, accessToken, state.baseSlug);
    return withWikiCache(cacheKey, async () => {
        const page = await fetchPageBySlug(slug, true, accessToken);
        assertWikiSlugInScope(page.slug, state.baseSlug);
        let treeItems = [];
        let titlesBySlug = {};
        if (pageContentNeedsTreeMacro(page.content)) {
            try {
                const treePayload = await getWikiTreePayload(accessToken);
                treeItems = Array.isArray(treePayload?.items) ? treePayload.items : [];
                titlesBySlug = treePayload?.titlesBySlug && typeof treePayload.titlesBySlug === 'object'
                    ? treePayload.titlesBySlug
                    : {};
            } catch {
                treeItems = [];
            }
        }
        const html = await renderWikiContent(page.content, {
            pageId: page.id,
            slug: page.slug,
            accessToken,
            treeItems,
            titlesBySlug
        });
        const title = resolveWikiPageTitle(page, page.content);
        return {
            id: page.id,
            slug: page.slug,
            title,
            updatedAt: page.updatedAt,
            html,
            editUrl: buildWikiExternalUrl(page.slug)
        };
    }, getWikiCacheTtl('page'));
}
