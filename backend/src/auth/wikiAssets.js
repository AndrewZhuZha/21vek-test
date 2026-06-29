import { config } from '../config.js';
import { withWikiCache } from '../middleware/wikiCache.js';
import { yandexFetchBinary } from './yandexFetch.js';
import { normalizeWikiSlug } from './wikiScope.js';
import { getWikiAssetCacheKey } from './wikiCacheKeys.js';
import { WIKI_API_BASE, WIKI_WEB_BASE } from './wikiConstants.js';
import { createWikiError } from './wikiErrors.js';
import { resolveWikiOrgId, resolveWikiOAuthToken, ensureWikiApiReady } from './wikiConfig.js';
import { splitSlug } from './wikiTitles.js';
import {
    wikiGet,
    fetchPageBySlug,
    fetchPageAttachmentsMap,
    normalizeResourcesList,
    isJsonObject,
    assertWikiAssetAccess
} from './wikiApiClient.js';

function buildAssetProxyUrl(pageId, fileName, sourceSlug, attachmentId, remoteSrc) {
    const params = new URLSearchParams();
    if (pageId) {
        params.set('pageId', String(pageId));
    }
    const normalizedName = String(fileName || '').trim();
    if (normalizedName) {
        params.set('file', normalizedName.split('/').pop() || normalizedName);
    }
    const slug = normalizeWikiSlug(sourceSlug || '');
    if (slug) {
        params.set('slug', slug);
    }
    const id = Number(attachmentId);
    if (Number.isFinite(id) && id > 0) {
        params.set('attachmentId', String(id));
    }
    const remote = String(remoteSrc || '').trim();
    if (remote) {
        params.set('src', remote);
    }
    return `/api/wiki/asset?${params.toString()}`;
}

function normalizeWikiAssetPath(rawPath) {
    return String(rawPath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\s+/g, '')
        .replace(/\/\.files\//gi, '/.files/')
        .replace(/\/files\//gi, '/.files/');
}

function normalizeWikiDownloadUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) {
        return '';
    }
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    if (url.startsWith('/')) {
        if (/^\/v1\//i.test(url)) {
            return `${WIKI_API_BASE}${url.slice(3)}`;
        }
        if (/^\/pages\//i.test(url)) {
            return `${WIKI_API_BASE}${url}`;
        }
        return `${WIKI_WEB_BASE}${url}`;
    }
    return url;
}

function buildWikiResourceDownloadUrl(pageId, resourceId) {
    const id = Number(pageId);
    const resource = Number(resourceId);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(resource) || resource <= 0) {
        return '';
    }
    return `${WIKI_API_BASE}/pages/${id}/resources/${resource}/download`;
}

/**
 * Путь для Wiki API download_by_url: {slug}/.files/{filename}
 * @see https://yandex.ru/support/wiki/en/api-ref/attachments/pagesattachments__download_by_filename_slug_pair
 */
function buildWikiFilesPath(sourceSlug, remotePath, fileName) {
    const pathInfo = extractFilesPathInfo(remotePath || '');
    const slug = pathInfo?.slug || normalizeWikiSlug(sourceSlug || '');
    const name = pathInfo?.fileName || extractImageFileName(fileName || remotePath || '');
    if (!slug || !name) {
        return '';
    }
    return `${slug}/.files/${name}`;
}

function buildWikiDownloadByUrlApiUrl(filesPath) {
    const normalized = String(filesPath || '').trim().replace(/^\/+/, '');
    if (!normalized.includes('/.files/')) {
        return '';
    }
    const params = new URLSearchParams();
    params.set('url', normalized);
    params.set('download', 'true');
    return `${WIKI_API_BASE}/pages/attachments/download_by_url?${params.toString()}`;
}

function isPresignedWikiAssetUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        const host = parsed.hostname.toLowerCase();
        if (host.includes('storage.yandexcloud.net') || host.includes('downloader.disk.yandex')) {
            return true;
        }
        const search = parsed.search || '';
        return /(?:^|[?&])(?:X-Amz-Signature|Signature|signature|Expires|expires)=/i.test(search);
    } catch {
        return false;
    }
}

function isWikiApiDownloadUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        return parsed.hostname.toLowerCase().includes('api.wiki.yandex.');
    } catch {
        return false;
    }
}

function buildWikiAssetDownloadAttempts(candidateUrls, accessToken) {
    const attempts = [];
    const seen = new Set();
    const addAttempt = (url, headers) => {
        const normalizedUrl = String(url || '').trim();
        if (!normalizedUrl) {
            return;
        }
        const key = `${normalizedUrl}\0${JSON.stringify(headers || {})}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        attempts.push({ url: normalizedUrl, headers: headers || { Accept: '*/*' } });
    };

    candidateUrls.forEach((rawUrl) => {
        const url = normalizeWikiDownloadUrl(rawUrl);
        if (!url) {
            return;
        }
        if (isPresignedWikiAssetUrl(url)) {
            addAttempt(url, { Accept: '*/*' });
            return;
        }
        addAttempt(url, { Accept: '*/*' });
        addAttempt(url, wikiBinaryFetchHeaders(url, accessToken));
    });

    return attempts;
}

function wikiBinaryFetchHeaders(downloadUrl, accessToken) {
    if (isPresignedWikiAssetUrl(downloadUrl)) {
        return { Accept: '*/*' };
    }
    return {
        Authorization: `OAuth ${resolveWikiOAuthToken(accessToken)}`,
        'X-Org-Id': resolveWikiOrgId(),
        Accept: '*/*'
    };
}

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

function extractFilesPathInfo(rawPath) {
    const raw = normalizeWikiAssetPath(String(rawPath || '').trim());
    if (!raw) {
        return null;
    }
    const withoutHost = raw
        .replace(/^https?:\/\/wiki\.yandex\.(ru|com)/i, '')
        .replace(/^\/+/, '/');
    const match = withoutHost.match(/^(\/[^?\s#]+?)\/\.files\/([^/?#\s)]+)$/i);
    if (!match) {
        return null;
    }
    const webPath = match[1];
    const fileName = decodeURIComponent(match[2]);
    return {
        slug: normalizeWikiSlug(webPath.replace(/^\/+/, '')),
        fileName,
        webPath
    };
}

function slugCandidatesFromFilesPath(slug) {
    const normalized = normalizeWikiSlug(slug || '');
    if (!normalized) {
        return [];
    }
    const parts = splitSlug(normalized);
    const candidates = [normalized];
    if (parts.length > 1) {
        candidates.push(parts.slice(0, -1).join('/'));
    }
    if (parts.length > 2) {
        candidates.push(parts.slice(0, -2).join('/'));
    }
    return [...new Set(candidates)];
}

async function findAttachmentForFile(params = {}) {
    const accessToken = params.accessToken;
    const pathFileName = extractImageFileName(params.remotePath || '');
    const remoteHasFilesPath = String(params.remotePath || '').includes('/.files/');
    const lookupKey = decodeURIComponent(String(
        (remoteHasFilesPath && pathFileName ? pathFileName : '')
        || params.fileName
        || pathFileName
        || ''
    )
        .split('/')
        .pop() || '')
        .trim()
        .toLowerCase();
    if (!lookupKey) {
        return null;
    }

    const filesPath = buildWikiFilesPath(params.sourceSlug, params.remotePath || params.fileName, lookupKey);
    const downloadByUrlApi = buildWikiDownloadByUrlApiUrl(filesPath);
    if (downloadByUrlApi) {
        let resolvedPageId = Number(params.pageId);
        if ((!Number.isFinite(resolvedPageId) || resolvedPageId <= 0) && params.sourceSlug) {
            try {
                const page = await fetchPageBySlug(normalizeWikiSlug(params.sourceSlug), false, accessToken);
                if (page?.id) {
                    resolvedPageId = page.id;
                }
            } catch {
                // page id optional for download_by_url
            }
        }
        return {
            name: lookupKey,
            downloadUrl: downloadByUrlApi,
            mimetype: null,
            pageId: Number.isFinite(resolvedPageId) && resolvedPageId > 0 ? resolvedPageId : null,
            id: null
        };
    }

    const pageIdsToTry = new Set();
    const pageId = Number(params.pageId);
    if (Number.isFinite(pageId) && pageId > 0) {
        pageIdsToTry.add(pageId);
    }

    const slugsToTry = new Set();
    const sourceSlug = normalizeWikiSlug(params.sourceSlug || '');
    if (sourceSlug) {
        slugCandidatesFromFilesPath(sourceSlug).forEach((slug) => slugsToTry.add(slug));
    }
    const pathInfo = extractFilesPathInfo(params.remotePath || params.fileName || '');
    if (pathInfo) {
        slugCandidatesFromFilesPath(pathInfo.slug).forEach((slug) => slugsToTry.add(slug));
    }

    for (const slug of slugsToTry) {
        try {
            const page = await fetchPageBySlug(slug, false, accessToken);
            if (page?.id) {
                pageIdsToTry.add(page.id);
            }
        } catch {
            // try next slug candidate
        }
    }

    for (const id of pageIdsToTry) {
        try {
            const attachments = await fetchPageAttachmentsMap(id, accessToken);
            const attachment = attachments.get(lookupKey)
                || attachments.get(String(params.fileName || '').toLowerCase())
                || (pathInfo ? attachments.get(pathInfo.fileName.toLowerCase()) : null)
                || (remoteHasFilesPath && pathFileName
                    ? [...attachments.values()].find((entry) => {
                        const entryName = String(entry?.name || '').toLowerCase();
                        const entryUrl = String(entry?.downloadUrl || '').toLowerCase();
                        return entryName === pathFileName.toLowerCase()
                            || entryUrl.includes(`/.files/${pathFileName.toLowerCase()}`);
                    }) || null
                    : null);
            if (attachment?.downloadUrl) {
                return { ...attachment, pageId: id };
            }

            try {
                const searchPayload = await wikiGet(`/pages/${id}/resources`, {
                    types: 'attachment',
                    q: lookupKey,
                    page_size: 20
                }, accessToken);
                const resources = normalizeResourcesList(searchPayload);
                const found = resources.find((resource) => {
                    if (resource?.type !== 'attachment' || !isJsonObject(resource.item)) {
                        return false;
                    }
                    const name = String(resource.item.name || '').trim().toLowerCase();
                    return name === lookupKey
                        || name.endsWith(`/${lookupKey}`)
                        || name.split('/').pop() === lookupKey;
                });
                const downloadUrl = found?.item?.download_url || found?.item?.downloadUrl;
                if (downloadUrl) {
                    return {
                        name: found.item.name,
                        downloadUrl: String(downloadUrl),
                        mimetype: found.item.mimetype || null,
                        pageId: id,
                        id: Number(found.item.id) || null
                    };
                }
            } catch {
                // try next page id
            }
        } catch {
            // try next page id
        }
    }

    return findAttachmentFromPageContent(params);
}

/**
 * @param {{ pageId?: number, fileName?: string, remotePath?: string, sourceSlug?: string, accessToken?: string }} params
 */
async function findAttachmentFromPageContent(params = {}) {
    const accessToken = params.accessToken;
    const pathFileName = extractImageFileName(params.remotePath || '');
    const lookupKey = decodeURIComponent(String(params.fileName || pathFileName || '')
        .split('/')
        .pop() || '')
        .trim()
        .toLowerCase();
    if (!lookupKey || !resolveWikiOAuthToken(accessToken)) {
        return null;
    }

    const slugsToTry = new Set();
    const sourceSlug = normalizeWikiSlug(params.sourceSlug || '');
    if (sourceSlug) {
        slugCandidatesFromFilesPath(sourceSlug).forEach((slug) => slugsToTry.add(slug));
    }
    const pathInfo = extractFilesPathInfo(params.remotePath || params.fileName || '');
    if (pathInfo?.slug) {
        slugCandidatesFromFilesPath(pathInfo.slug).forEach((slug) => slugsToTry.add(slug));
    }

    const escapedName = lookupKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const urlPattern = new RegExp(`https://[^\\s"'<>]*${escapedName}(?:[?][^\\s"'<>]*)?`, 'gi');

    for (const slug of slugsToTry) {
        try {
            const page = await fetchPageBySlug(slug, true, accessToken);
            const content = String(page?.content || '');
            if (!content) {
                continue;
            }

            const downloadUrlMatches = [...content.matchAll(/download_url["\s:]*(["'])(https?:\/\/[^"'\\]+)\1/gi)];
            for (const match of downloadUrlMatches) {
                const downloadUrl = String(match[2] || '').trim();
                if (!downloadUrl.toLowerCase().includes(lookupKey)) {
                    continue;
                }
                return {
                    name: lookupKey,
                    downloadUrl,
                    mimetype: null,
                    pageId: page.id,
                    id: null
                };
            }

            for (const match of content.matchAll(urlPattern)) {
                const downloadUrl = String(match[0] || '').trim();
                if (!downloadUrl || !isPresignedWikiAssetUrl(downloadUrl)) {
                    continue;
                }
                return {
                    name: lookupKey,
                    downloadUrl,
                    mimetype: null,
                    pageId: page.id,
                    id: null
                };
            }
        } catch {
            // try next slug
        }
    }

    return null;
}

function isWikiHostedMediaUrl(src) {
    try {
        const parsed = new URL(String(src || '').trim(), WIKI_WEB_BASE);
        const host = parsed.hostname.toLowerCase();
        if (!['wiki.yandex.ru', 'wiki.yandex.com', 'api.wiki.yandex.net', 'storage.yandexcloud.net'].includes(host)) {
            return false;
        }
        return parsed.pathname.includes('/.files/')
            || parsed.pathname.includes('/attachments/')
            || /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

function resolveWikiImageSrc(rawSrc, pageId, attachments, scopeSlug) {
    const src = String(rawSrc || '').trim();
    if (!src || /^data:image\//i.test(src)) {
        return src;
    }
    if (src.startsWith('/api/wiki/asset')) {
        return src;
    }

    const fileName = extractImageFileName(src);
    const attachment = fileName
        ? (attachments.get(fileName.toLowerCase()) || attachments.get(src.toLowerCase()))
        : attachments.get(src.toLowerCase());

    const proxySlug = normalizeWikiSlug(scopeSlug || '') || undefined;

    if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
        const absolute = src.startsWith('//') ? `https:${src}` : src;
        if (isWikiHostedMediaUrl(absolute) && pageId) {
            const pathInfo = extractFilesPathInfo(absolute);
            return buildAssetProxyUrl(
                pageId,
                pathInfo?.fileName || fileName,
                proxySlug || pathInfo?.slug,
                attachment?.id,
                src
            );
        }
        return absolute;
    }

    if (attachment && pageId) {
        const pathInfo = extractFilesPathInfo(src);
        return buildAssetProxyUrl(
            pageId,
            pathInfo?.fileName || attachment.name,
            proxySlug || pathInfo?.slug,
            attachment.id,
            src
        );
    }

    if (pageId && fileName) {
        const pathInfo = extractFilesPathInfo(src);
        return buildAssetProxyUrl(
            pageId,
            pathInfo?.fileName || fileName,
            proxySlug || pathInfo?.slug,
            undefined,
            src
        );
    }

    if (src.startsWith('/')) {
        if (pageId && (src.includes('/.files/') || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(src))) {
            const pathInfo = extractFilesPathInfo(normalizeWikiAssetPath(src));
            return buildAssetProxyUrl(
                pageId,
                pathInfo?.fileName || fileName,
                proxySlug || pathInfo?.slug,
                undefined,
                src
            );
        }
        return `${WIKI_WEB_BASE}${src}`;
    }

    return src;
}

function resolveWikiImagesInHtml(html, context = {}) {
    const pageId = Number(context.pageId);
    if (!Number.isFinite(pageId) || pageId <= 0) {
        return html;
    }

    const source = String(html || '');
    const regex = /<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi;
    const matches = [...source.matchAll(regex)];
    if (!matches.length) {
        return source;
    }

    let result = source;
    let imageIndex = 0;
    for (const match of matches) {
        const fullMatch = match[0];
        if (/\bwiki-figure__img\b/.test(fullMatch)) {
            continue;
        }

        const before = match[1];
        const src = match[3];
        const after = match[4];
        const pathInfo = extractFilesPathInfo(src);
        const fileName = extractImageFileName(src);
        const scopeSlug = context.slug || pathInfo?.slug;

        let finalSrc = '';
        if (buildWikiFilesPath(scopeSlug, src, fileName)) {
            finalSrc = buildAssetProxyUrl(
                pageId,
                pathInfo?.fileName || fileName,
                scopeSlug,
                undefined,
                src
            );
        } else {
            finalSrc = resolveWikiImageSrc(src, pageId, new Map(), context.slug);
        }

        if (!finalSrc) {
            continue;
        }

        const isPriority = imageIndex === 0;
        imageIndex += 1;
        const safeSrc = finalSrc.replace(/"/g, '&quot;');
        const cleanBefore = before
            .replace(/\sclass=(["'])[^"']*\1/i, ' ')
            .replace(/\sloading=(["'])[^"']*\1/i, ' ')
            .replace(/\sdecoding=(["'])[^"']*\1/i, ' ')
            .replace(/\sfetchpriority=(["'])[^"']*\1/i, ' ')
            .replace(/\sstyle=(["'])[^"']*\1/i, ' ');
        const cleanAfter = after
            .replace(/\sclass=(["'])[^"']*\1/i, ' ')
            .replace(/\sloading=(["'])[^"']*\1/i, ' ')
            .replace(/\sdecoding=(["'])[^"']*\1/i, ' ')
            .replace(/\sfetchpriority=(["'])[^"']*\1/i, ' ')
            .replace(/\sstyle=(["'])[^"']*\1/i, ' ');
        const loadingAttr = isPriority ? 'eager' : 'lazy';
        const priorityAttr = isPriority ? ' fetchpriority="high"' : '';
        const replacement = `<figure class="wiki-figure wiki-figure--loading"><img${cleanBefore}src="${safeSrc}"${cleanAfter} class="wiki-figure__img" loading="${loadingAttr}" decoding="async"${priorityAttr}><span class="wiki-figure__loader" aria-hidden="true"></span></figure>`;
        result = result.replace(fullMatch, replacement);
    }

    return result;
}

function getWikiAssetCacheKeyForRequest(params) {
    const normalizedSourceSlug = normalizeWikiSlug(params.slug || '');
    const remotePath = String(params.src || '').trim();
    const pathFileName = extractImageFileName(remotePath);
    const lookupName = pathFileName || String(params.file || '').trim();
    const filesPath = buildWikiFilesPath(normalizedSourceSlug, remotePath, lookupName);
    return getWikiAssetCacheKey(filesPath, params.accessToken);
}

async function fetchWikiAssetBuffer(pageId, fileName, accessToken, remoteUrl, sourceSlug, attachmentIdRaw) {
    const normalizedSourceSlug = normalizeWikiSlug(sourceSlug || '');
    const remotePath = String(remoteUrl || '').trim();
    const pathFileName = extractImageFileName(remotePath);
    const lookupName = pathFileName || String(fileName || '').trim();
    const filesPath = buildWikiFilesPath(normalizedSourceSlug, remotePath, lookupName);
    const cacheKey = getWikiAssetCacheKey(filesPath, accessToken);

    if (cacheKey) {
        const cached = await withWikiCache(cacheKey, async () => {
            const payload = await fetchWikiAssetBufferUncached(
                pageId,
                fileName,
                accessToken,
                remoteUrl,
                sourceSlug,
                attachmentIdRaw
            );
            return {
                bufferBase64: payload.buffer.toString('base64'),
                contentType: payload.contentType,
                fileName: payload.fileName
            };
        }, 3600);
        return {
            buffer: Buffer.from(String(cached.bufferBase64 || ''), 'base64'),
            contentType: cached.contentType,
            fileName: cached.fileName
        };
    }

    return fetchWikiAssetBufferUncached(
        pageId,
        fileName,
        accessToken,
        remoteUrl,
        sourceSlug,
        attachmentIdRaw
    );
}

/**
 * @param {number} pageId
 * @param {string} fileName
 * @param {string | undefined} accessToken
 */
async function fetchWikiAssetBufferUncached(pageId, fileName, accessToken, remoteUrl, sourceSlug, attachmentIdRaw) {
    ensureWikiApiReady(accessToken);
    let id = Number(pageId);
    const normalizedName = String(fileName || '').trim();
    const normalizedSourceSlug = normalizeWikiSlug(sourceSlug || '');
    const attachmentId = Number(attachmentIdRaw);
    if ((!Number.isFinite(id) || id <= 0) && !normalizedName && !Number.isFinite(attachmentId)) {
        throw createWikiError(400, 'Некорректный запрос файла Wiki.');
    }
    if (normalizedName.length > 260) {
        throw createWikiError(400, 'Некорректный запрос файла Wiki.');
    }

    const remotePath = String(remoteUrl || '').trim();
    const pathFileName = extractImageFileName(remotePath);
    const lookupName = pathFileName || normalizedName;

    const scopePage = await assertWikiAssetAccess(id, normalizedSourceSlug, accessToken);
    if (scopePage?.id) {
        id = scopePage.id;
    }

    let attachment = null;
    if (Number.isFinite(attachmentId) && attachmentId > 0 && Number.isFinite(id) && id > 0) {
        try {
            const map = await fetchPageAttachmentsMap(id, accessToken);
            attachment = map.get(`id:${attachmentId}`) || [...map.values()].find((entry) => entry.id === attachmentId) || null;
        } catch {
            attachment = null;
        }
    }

    if (!attachment) {
        attachment = await findAttachmentForFile({
            pageId: Number.isFinite(id) && id > 0 ? id : undefined,
            fileName: lookupName,
            remotePath: remotePath || normalizedName,
            sourceSlug: normalizedSourceSlug,
            accessToken
        });
    }

    const attachmentResourceId = Number(attachment?.id);
    const effectivePageId = Number(attachment?.pageId || id);
    let resolvedName = pathFileName || attachment?.name || normalizedName;
    let mimetype = attachment?.mimetype || null;

    const candidateUrls = [];
    const filesPath = buildWikiFilesPath(normalizedSourceSlug, remotePath, lookupName);
    const downloadByUrlApi = buildWikiDownloadByUrlApiUrl(filesPath);
    if (downloadByUrlApi) {
        candidateUrls.push(downloadByUrlApi);
    }
    if (attachment?.downloadUrl) {
        candidateUrls.push(attachment.downloadUrl);
    }
    if (Number.isFinite(attachmentResourceId) && attachmentResourceId > 0
        && Number.isFinite(effectivePageId) && effectivePageId > 0) {
        candidateUrls.push(buildWikiResourceDownloadUrl(effectivePageId, attachmentResourceId));
    } else if (Number.isFinite(attachmentId) && attachmentId > 0
        && Number.isFinite(id) && id > 0 && attachment?.downloadUrl) {
        candidateUrls.push(buildWikiResourceDownloadUrl(id, attachmentId));
    }

    const downloadAttempts = buildWikiAssetDownloadAttempts(candidateUrls, accessToken);
    if (!downloadAttempts.length) {
        throw createWikiError(404, 'Файл Wiki не найден.');
    }

    let response = null;
    let downloadUrl = downloadAttempts[0].url;
    for (const attempt of downloadAttempts) {
        response = await yandexFetchBinary(attempt.url, {
            headers: attempt.headers,
            timeoutMs: config.yandexWikiRequestTimeoutMs,
            maxResponseBytes: config.yandexWikiMaxResponseBytes
        });
        if (response.ok) {
            downloadUrl = attempt.url;
            break;
        }
        if (config.requestLogging && !response.ok) {
            console.warn('Wiki asset candidate failed', {
                status: response.status,
                url: attempt.url.slice(0, 160),
                api: isWikiApiDownloadUrl(attempt.url)
            });
        }
    }

    if (!response?.ok) {
        if (config.requestLogging) {
            console.warn('Wiki asset fetch failed', {
                status: response.status,
                file: resolvedName,
                url: downloadUrl.slice(0, 160)
            });
        }
        if ([401, 403].includes(response.status)) {
            throw createWikiError(
                response.status,
                'Нет доступа к файлу Wiki. Выйдите из портала и войдите заново — нужен scope wiki:read в OAuth-приложении.'
            );
        }
        throw createWikiError(response.status === 404 ? 404 : 502, 'Не удалось загрузить файл Wiki.');
    }

    const contentType = mimetype || response.contentType || 'application/octet-stream';
    if (!/^image\//i.test(contentType)) {
        throw createWikiError(403, 'Разрешена загрузка только изображений Wiki.');
    }

    return {
        buffer: response.buffer,
        contentType,
        fileName: resolvedName || normalizedName || 'asset'
    };
}

export {
    buildAssetProxyUrl,
    resolveWikiImagesInHtml,
    fetchWikiAssetBuffer,
    getWikiAssetCacheKeyForRequest,
    extractImageFileName,
    buildWikiFilesPath,
    normalizeWikiAssetPath
};
