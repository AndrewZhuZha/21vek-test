import { config } from '../config.js';
import { yandexFetch } from './yandexFetch.js';
import { normalizeWikiSlug, assertWikiSlugInScope } from './wikiScope.js';
import { WIKI_API_BASE, DEFAULT_DESCENDANTS_LIMIT } from './wikiConstants.js';
import { createWikiError } from './wikiErrors.js';
import { resolveWikiOrgId, resolveWikiOAuthToken, ensureWikiApiReady } from './wikiConfig.js';
import { pickPageTitle } from './wikiTitles.js';

function extractImageFileName(src) {
    const raw = decodeURIComponent(String(src || '').trim().split('?')[0]);
    if (!raw) {
        return '';
    }
    const withoutFiles = raw.includes('/.files/')
        ? raw.split('/.files/').pop() || raw
        : raw;
    return withoutFiles.split('/').pop() || withoutFiles;
}

function normalizeResourcesList(payload) {
    if (Array.isArray(payload?.results)) {
        return payload.results;
    }
    if (Array.isArray(payload?.resources)) {
        return payload.resources;
    }
    return [];
}

function indexAttachmentEntry(map, item) {
    if (!isJsonObject(item)) {
        return;
    }
    const name = String(item.name || '').trim();
    const downloadUrl = String(item.download_url || item.downloadUrl || '').trim();
    const attachmentId = Number(item.id);
    if (!name || !downloadUrl) {
        return;
    }
    const entry = {
        id: Number.isFinite(attachmentId) ? attachmentId : null,
        name: name.split('/').pop() || name,
        downloadUrl,
        mimetype: String(item.mimetype || '').trim() || null
    };
    if (Number.isFinite(attachmentId)) {
        map.set(`id:${attachmentId}`, entry);
    }
    map.set(name.toLowerCase(), entry);
    map.set(name.split('/').pop()?.toLowerCase() || name.toLowerCase(), entry);
    map.set(downloadUrl.toLowerCase(), entry);
    map.set(extractImageFileName(downloadUrl).toLowerCase(), entry);
}

async function fetchPageAttachmentsMap(pageId, accessToken) {
    const id = Number(pageId);
    const map = new Map();
    if (!Number.isFinite(id) || id <= 0) {
        return map;
    }

    let cursor = '';
    do {
        let payload;
        try {
            payload = await wikiGet(`/pages/${id}/attachments`, {
                page_size: 50,
                cursor
            }, accessToken);
        } catch (error) {
            if (config.requestLogging) {
                console.warn('Wiki attachments list failed', {
                    pageId: id,
                    endpoint: 'attachments',
                    status: Number(error?.status || 0),
                    message: error instanceof Error ? error.message : error
                });
            }
            break;
        }
        const results = Array.isArray(payload?.results) ? payload.results : [];
        results.forEach((item) => indexAttachmentEntry(map, item));
        cursor = String(payload?.next_cursor || '').trim();
    } while (cursor);

    cursor = '';
    do {
        let payload;
        try {
            payload = await wikiGet(`/pages/${id}/resources`, {
                types: 'attachment',
                page_size: 50,
                cursor
            }, accessToken);
        } catch (error) {
            if (config.requestLogging) {
                console.warn('Wiki attachments list failed', {
                    pageId: id,
                    endpoint: 'resources',
                    status: Number(error?.status || 0),
                    message: error instanceof Error ? error.message : error
                });
            }
            break;
        }
        const resources = normalizeResourcesList(payload);
        resources.forEach((resource) => {
            if (resource?.type !== 'attachment' || !isJsonObject(resource.item)) {
                return;
            }
            indexAttachmentEntry(map, resource.item);
        });
        cursor = String(payload?.next_cursor || '').trim();
    } while (cursor);

    return map;
}

function wikiHeaders(accessToken) {
    return {
        Authorization: `OAuth ${resolveWikiOAuthToken(accessToken)}`,
        'X-Org-Id': resolveWikiOrgId(),
        Accept: 'application/json'
    };
}

function isJsonObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeUpdatedAt(page) {
    return String(page?.updated_at || page?.updatedAt || page?.modified_at || page?.modifiedAt || '').trim() || null;
}

function normalizePage(page) {
    if (!isJsonObject(page)) {
        return null;
    }
    const slug = normalizeWikiSlug(page.slug);
    if (!slug) {
        return null;
    }
    const id = Number(page.id);
    const parentIdRaw = page.parent_id ?? page.parentId;
    const parentId = Number.isFinite(Number(parentIdRaw)) ? Number(parentIdRaw) : null;
    return {
        id: Number.isFinite(id) ? id : null,
        slug,
        title: pickPageTitle(page, slug),
        content: typeof page.content === 'string' ? page.content : '',
        updatedAt: normalizeUpdatedAt(page),
        parentId,
        original: page
    };
}

async function wikiGet(pathname, params = {}, accessToken) {
    ensureWikiApiReady(accessToken);

    const url = new URL(`${WIKI_API_BASE}${pathname}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
            return;
        }
        url.searchParams.set(key, String(value));
    });

    let response;
    try {
        response = await yandexFetch(url.toString(), {
            method: 'GET',
            headers: wikiHeaders(accessToken),
            timeoutMs: config.yandexWikiRequestTimeoutMs,
            maxResponseBytes: config.yandexWikiMaxResponseBytes
        });
    } catch (error) {
        const code = String(error?.code || '');
        if (code === 'REQUEST_TIMEOUT') {
            throw createWikiError(504, 'Таймаут запроса к Wiki API.');
        }
        if (code === 'RESPONSE_TOO_LARGE') {
            throw createWikiError(502, 'Ответ Wiki API слишком большой.');
        }
        throw createWikiError(502, 'Не удалось получить ответ от Wiki API.');
    }
    const payload = await response.json();
    if (response.ok) {
        return payload;
    }

    const errorCode = isJsonObject(payload) ? String(payload.error_code || '') : '';
    const debugMessage = isJsonObject(payload) ? String(payload.debug_message || payload.message || '') : '';

    if (response.status === 401 || response.status === 403) {
        throw createWikiError(
            401,
            `Wiki API: нет доступа (${errorCode || response.status}). Выйдите и войдите снова — нужен scope wiki:read.`
        );
    }
    if (response.status === 404) {
        throw createWikiError(404, 'Страница Wiki не найдена.');
    }

    const message = config.isProduction
        ? 'Ошибка запроса к Wiki API.'
        : (debugMessage || `Wiki API request failed (${response.status})`);
    if (config.isProduction && debugMessage) {
        console.warn('Wiki API error:', { status: response.status, errorCode, debugMessage: debugMessage.slice(0, 500) });
    }
    throw createWikiError(502, message);
}

async function fetchPageById(pageId, includeContent = false, accessToken) {
    const id = Number(pageId);
    if (!Number.isFinite(id) || id <= 0) {
        throw createWikiError(400, 'Некорректный id страницы Wiki.');
    }
    const params = includeContent ? { fields: 'content' } : {};
    const payload = await wikiGet(`/pages/${id}`, params, accessToken);
    const page = normalizePage(payload);
    if (!page) {
        throw createWikiError(502, 'Wiki API вернул некорректный ответ страницы.');
    }
    return page;
}

/**
 * Validates asset access via the owning page (pageId), not the image path slug.
 * @returns {Promise<{ id: number, slug: string } | null>}
 */
async function assertWikiAssetAccess(pageId, sourceSlug, accessToken) {
    const id = Number(pageId);
    if (Number.isFinite(id) && id > 0) {
        const page = await fetchPageById(id, false, accessToken);
        assertWikiSlugInScope(page.slug);
        return page;
    }

    const normalized = normalizeWikiSlug(sourceSlug || '');
    if (normalized) {
        const page = await fetchPageBySlug(normalized, false, accessToken);
        assertWikiSlugInScope(page.slug);
        return page;
    }

    throw createWikiError(400, 'Укажите pageId или slug страницы Wiki для загрузки файла.');
}

async function fetchPageBySlug(slug, includeContent = false, accessToken) {
    const normalizedSlug = normalizeWikiSlug(slug || config.yandexWikiBaseSlug);
    if (!normalizedSlug) {
        throw createWikiError(400, 'Slug страницы Wiki не задан.');
    }

    const pagePayload = await wikiGet('/pages', {
        slug: normalizedSlug,
        fields: includeContent ? 'content' : ''
    }, accessToken);
    const page = normalizePage(pagePayload);
    if (!page) {
        throw createWikiError(404, `Страница Wiki "${normalizedSlug}" не найдена.`);
    }

    if (!includeContent) {
        return page;
    }

    if (page.content) {
        return page;
    }

    const withContent = await fetchPageById(page.id, true, accessToken);
    return {
        ...page,
        content: withContent.content || ''
    };
}

async function fetchDescendantsBySlug(baseSlug, accessToken) {
    const normalizedBaseSlug = normalizeWikiSlug(baseSlug || config.yandexWikiBaseSlug);
    if (!normalizedBaseSlug) {
        throw createWikiError(400, 'Базовый slug для Wiki не задан.');
    }

    const pageSize = 100;
    const maxResults = Math.max(1, Number(config.yandexWikiDescendantsMax) || DEFAULT_DESCENDANTS_LIMIT);
    const allPages = [];
    let cursor = '';
    let truncated = false;

    while (allPages.length < maxResults) {
        const payload = await wikiGet('/pages/descendants', {
            slug: normalizedBaseSlug,
            include_self: 'true',
            page_size: pageSize,
            cursor
        }, accessToken);

        const chunk = Array.isArray(payload?.results) ? payload.results : [];
        chunk.forEach((item) => {
            const page = normalizePage(item);
            if (page) {
                allPages.push(page);
            }
        });

        cursor = String(payload?.next_cursor || '').trim();
        if (!cursor) {
            break;
        }
    }

    if (cursor) {
        truncated = true;
    }

    if (!allPages.length) {
        const rootPage = await fetchPageBySlug(normalizedBaseSlug, false, accessToken);
        allPages.push(rootPage);
    }

    return {
        pages: allPages,
        truncated
    };
}

export {
    wikiGet,
    wikiHeaders,
    normalizePage,
    fetchPageBySlug,
    fetchPageById,
    fetchDescendantsBySlug,
    assertWikiAssetAccess,
    fetchPageAttachmentsMap,
    normalizeResourcesList,
    isJsonObject
};

export const fetchWikiPageBySlug = fetchPageBySlug;
