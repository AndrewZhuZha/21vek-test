import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { config } from '../config.js';
import { withWikiCache } from '../middleware/wikiCache.js';
import { yandexFetch, yandexFetchBinary } from './yandexFetch.js';
import {
    applyInlineMarkdown,
    convertLegacyWikiColors,
    hasWikiYfmDirectives,
    linkifyPlainUrls,
    resolveWikiTreeMacros,
    stripUnresolvedWikiMacros,
    unwrapWikiDirectivesFromHtml
} from './wikiMarkup.js';
import { getWikiPageCacheKey, getWikiSearchCacheKey, getWikiTreeCacheKey, getWikiAssetCacheKey } from './wikiCacheKeys.js';
import {
    assertWikiSlugInScope,
    isSlugInBaseScope,
    normalizeWikiSlug
} from './wikiScope.js';

export { normalizeWikiSlug, assertWikiSlugInScope };
export { getWikiPageCacheKey, getWikiTreeCacheKey, getWikiAssetCacheKey };

const WIKI_API_BASE = 'https://api.wiki.yandex.net/v1';
const WIKI_WEB_BASE = 'https://wiki.yandex.ru';

let transformFn = null;
let transformChecked = false;
const DEFAULT_DESCENDANTS_LIMIT = 500;
const SAFE_HTML_ALLOWED_TAGS = [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'pre',
    'code',
    'blockquote',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
    'figure',
    'kbd',
    'mark',
    'del',
    'details',
    'summary'
];
const SAFE_HTML_ALLOWED_ATTRIBUTES = {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'title', 'role', 'aria-*'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class'],
    div: ['class', 'title', 'role', 'note-type'],
    span: ['class', 'title', 'role'],
    kbd: ['class'],
    code: ['class'],
    pre: ['class'],
    table: ['class'],
    th: ['class', 'scope', 'colspan', 'rowspan'],
    td: ['class', 'colspan', 'rowspan']
};

/**
 * @param {number} status
 * @param {string} message
 * @returns {Error & { status: number }}
 */
function createWikiError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function resolveWikiOrgId() {
    return String(config.yandexWikiOrgId || config.yandex360OrgId || '').trim();
}

function resolveWikiOAuthToken(accessToken) {
    const serviceToken = String(config.yandexWikiOAuthToken || '').trim();
    if (serviceToken) {
        return serviceToken;
    }
    return String(accessToken || '').trim();
}

function splitSlug(value) {
    return normalizeWikiSlug(value)
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
}

function slugDepth(slug) {
    return splitSlug(slug).length;
}

function slugToLabel(slug) {
    const parts = splitSlug(slug);
    const tail = parts[parts.length - 1] || '';
    return tail
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Страница';
}

function pickPageTitle(rawPage, slug) {
    const candidates = [
        rawPage?.title,
        rawPage?.name,
        rawPage?.page_title,
        rawPage?.attributes?.title
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) {
            return value;
        }
    }
    return slugToLabel(slug);
}

function cleanWikiInlineText(value) {
    return String(value || '')
        .replace(/\{%[\s\S]*?%\}/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function isUsefulExtractedTitle(value) {
    const text = cleanWikiInlineText(value);
    if (text.length < 3 || text.length > 160) {
        return false;
    }
    return /[а-яё]/i.test(text);
}

function parentSlugOf(slug) {
    const parts = splitSlug(slug);
    if (parts.length <= 1) {
        return '';
    }
    return parts.slice(0, -1).join('/');
}

function isLikelyFallbackTitle(title, slug) {
    const normalizedTitle = String(title || '').trim().toLowerCase();
    if (!normalizedTitle) {
        return true;
    }
    const fallback = slugToLabel(slug).toLowerCase();
    const slugTail = splitSlug(slug).pop()?.replace(/[-_]+/g, ' ').toLowerCase() || '';
    if (normalizedTitle === fallback || normalizedTitle === slugTail) {
        return true;
    }
    // Latin transliteration instead of a Russian page title.
    if (!/[а-яё]/i.test(normalizedTitle) && /[a-z]/i.test(normalizedTitle)) {
        if (slugTail.includes(' ') || slugTail.includes('-')) {
            return true;
        }
        const slugTailCompact = slugTail.replace(/\s+/g, '');
        const titleCompact = normalizedTitle.replace(/\s+/g, '');
        if (slugTailCompact && titleCompact === slugTailCompact) {
            return true;
        }
    }
    return false;
}

function extractTitleFromWikiContent(content) {
    const raw = String(content || '').trim();
    if (!raw) {
        return '';
    }

    const headingPatterns = [
        /^#{1,6}\s+(.+?)\s*$/gm,
        /^(.+?)\s*\n={3,}\s*$/gm
    ];
    for (const pattern of headingPatterns) {
        let match;
        while ((match = pattern.exec(raw)) !== null) {
            const heading = cleanWikiInlineText(match[1]);
            if (isUsefulExtractedTitle(heading)) {
                return heading;
            }
        }
    }

    const htmlHeadingMatches = raw.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi);
    for (const match of htmlHeadingMatches) {
        const heading = cleanWikiInlineText(match[1]);
        if (isUsefulExtractedTitle(heading)) {
            return heading;
        }
    }

    const boldMatch = raw.match(/^\s*(?:\*\*|__)([^*\n_]{3,160})(?:\*\*|__)/m);
    if (boldMatch) {
        const bold = cleanWikiInlineText(boldMatch[1]);
        if (isUsefulExtractedTitle(bold)) {
            return bold;
        }
    }

    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines.slice(0, 40)) {
        if (/^\{%/.test(line) || /^\{\{/.test(line) || /^!\[/.test(line)) {
            continue;
        }
        const plain = cleanWikiInlineText(line.replace(/^#+\s+/, ''));
        if (isUsefulExtractedTitle(plain)) {
            return plain;
        }
    }

    return '';
}

export function resolveWikiPageTitle(page, content = '') {
    const slug = normalizeWikiSlug(page?.slug);
    let title = String(page?.title || '').trim();
    if (title && !isLikelyFallbackTitle(title, slug)) {
        return title;
    }
    const extracted = extractTitleFromWikiContent(content || page?.content || '');
    if (extracted && !isLikelyFallbackTitle(extracted, slug)) {
        return extracted;
    }
    return title || slugToLabel(slug);
}

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

/**
 * @param {{ pageId?: number, fileName?: string, remotePath?: string, sourceSlug?: string, accessToken?: string }} params
 */
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

function normalizeResourcesList(payload) {
    if (Array.isArray(payload?.results)) {
        return payload.results;
    }
    if (Array.isArray(payload?.resources)) {
        return payload.resources;
    }
    return [];
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function legacyImageToTag(rawPath, altText = '') {
    const path = normalizeWikiAssetPath(String(rawPath || '').trim());
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const safeAlt = escapeHtml(String(altText || '').trim());
    return `\n\n<img src="${normalizedPath}" alt="${safeAlt}" loading="lazy" decoding="async">\n\n`;
}

function convertLegacyWikiImages(text) {
    let result = String(text || '');

    result = result.replace(
        /\(\s*(\/?[^)\s"]+?\/\.files\/[^)\s"]+?\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\s+"([^"]*)")?(?:\s*=\s*\d+x\d+)?\s*\)\s*!?/gi,
        (_, rawPath, altText) => legacyImageToTag(rawPath, altText)
    );

    result = result.replace(
        /\(\s*(\/?[^)\s"]+?\/\.files\/[^)\s"]+?\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\s+"([^"]*)")?(?:\s*=\s*\d+x\d+)?\s*$/gim,
        (_, rawPath, altText) => legacyImageToTag(rawPath, altText)
    );

    result = result.replace(
        /\[([^\[\]\n]+\.(?:png|jpe?g|gif|webp|svg|bmp))\]/gi,
        (_, file) => legacyImageToTag(file)
    );

    result = result.replace(
        /(\d+)x(\d+):([^\s<)]+)/gi,
        (_, _w, _h, file) => legacyImageToTag(file)
    );

    return result;
}

function preprocessLegacyWikiMarkup(content) {
    let text = String(content || '').replace(/\r\n/g, '\n');

    text = text.replace(/\/\s+\.files\//gi, '/.files/');
    text = text.replace(/\/\s+files\//gi, '/.files/');
    text = unwrapWikiDirectivesFromHtml(text);
    text = text.replace(/([\p{L}\d][\p{L}\d\s«»""'\-–—,.]{8,}?):\1/gu, '$1');
    text = text.replace(/\(##`([^`]+)`##\*\*\)/gi, ' [$1]($1) ');
    text = text.replace(/\(##([^#]+?)##\*\*\)/gi, ' [$1]($1) ');
    text = text.replace(/#{5,}\s*\*\*([^*]+?)\*\*/g, '##### $1');
    text = text.replace(/#{3,}\s*\*\*([^*]+?)\*\*/g, '### $1');
    text = text.replace(/\.\.+(\*\*)+/g, '');
    text = text.replace(/#{5,}\s*!\s*$/gm, '');
    text = text.replace(/^\s*!\s*$/gm, '');
    text = text.replace(/<p>\s*!\s*<\/p>/gi, '');

    text = text
        .split('\n')
        .map((line) => {
            const legacyNumberedHeading = line.match(/^(\s*)#(\d+\.\s*[^#\n]+?)#(\s*)$/);
            if (legacyNumberedHeading) {
                return `${legacyNumberedHeading[1]}## ${legacyNumberedHeading[2].trim()}${legacyNumberedHeading[3]}`;
            }

            const legacyHeading = line.match(/^(\s*)#([^#\n]+?)#(\s*)$/);
            if (legacyHeading) {
                return `${legacyHeading[1]}# ${legacyHeading[2].trim()}${legacyHeading[3]}`;
            }

            const legacySubheading = line.match(/^(\s*)##([^#\n]+?)##(\s*)$/);
            if (legacySubheading) {
                return `${legacySubheading[1]}## ${legacySubheading[2].trim()}${legacySubheading[3]}`;
            }

            return line;
        })
        .join('\n');

    return text;
}

/**
 * @param {Map<string, { name: string, downloadUrl: string, mimetype: string | null, id?: number | null }>} map
 * @param {unknown} item
 */
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

/**
 * @param {number | null | undefined} pageId
 * @param {string | undefined} accessToken
 * @returns {Promise<Map<string, { name: string, downloadUrl: string, mimetype: string | null, id?: number | null }>>}
 */
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

/**
 * @param {string} html
 * @param {{ pageId?: number | null, slug?: string, accessToken?: string }} context
 */
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

/**
 * @param {Array<{ id?: number | null, slug: string, title?: string, parentId?: number | null, updatedAt?: string | null, content?: string }>} pages
 * @param {string | undefined} accessToken
 */
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
                page.title = resolveWikiPageTitle(
                    { ...page, ...fetched, title: fetched.title || page.title },
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

export function isWikiReaderEnabled() {
    return Boolean(config.yandexWikiEnabled && config.yandexWikiBaseSlug);
}

export function isWikiApiConfigured() {
    if (!isWikiReaderEnabled() || !resolveWikiOrgId()) {
        return false;
    }
    if (config.yandexWikiOAuthToken) {
        return true;
    }
    return Boolean(config.yandexWikiEnabled && config.yandexClientId);
}

export function getWikiConfigState() {
    const serviceTokenConfigured = Boolean(String(config.yandexWikiOAuthToken || '').trim());
    return {
        enabled: isWikiReaderEnabled(),
        configured: isWikiApiConfigured(),
        authMode: serviceTokenConfigured ? 'service' : 'delegated',
        baseSlug: normalizeWikiSlug(config.yandexWikiBaseSlug),
        baseTitle: String(config.yandexWikiBaseTitle || '').trim(),
        externalUrl: String(config.yandexWikiExternalUrl || '').trim() || buildWikiExternalUrl(config.yandexWikiBaseSlug)
    };
}

export function buildWikiExternalUrl(slug) {
    const normalized = normalizeWikiSlug(slug);
    return normalized ? `${WIKI_WEB_BASE}/${normalized}` : WIKI_WEB_BASE;
}

function getWikiCacheTtl(type) {
    const baseTtl = Math.max(1, Number(config.yandexWikiCacheTtlSec) || 300);
    if (type === 'tree') {
        return Math.max(baseTtl, Number(config.yandexWikiTreeCacheTtlSec) || baseTtl);
    }
    if (type === 'search') {
        return Math.max(1, Number(config.yandexWikiSearchCacheTtlSec) || baseTtl);
    }
    if (type === 'page') {
        return Math.max(1, Number(config.yandexWikiPageCacheTtlSec) || baseTtl);
    }
    return baseTtl;
}

function ensureWikiApiReady(accessToken) {
    const state = getWikiConfigState();
    if (!state.enabled) {
        throw createWikiError(503, 'Wiki reader отключён (YANDEX_WIKI_ENABLED=false).');
    }
    if (!state.configured) {
        throw createWikiError(503, 'Wiki reader не настроен: проверьте YANDEX_WIKI_ORG_ID и OAuth-приложение.');
    }
    if (!resolveWikiOAuthToken(accessToken)) {
        throw createWikiError(
            401,
            'Wiki API: нет токена. Задайте YANDEX_WIKI_OAUTH_TOKEN или войдите заново (scope wiki:read).'
        );
    }
}

/**
 * @param {string} pathname
 * @param {Record<string, string | number | boolean>} [params]
 * @param {string | undefined} [accessToken]
 * @returns {Promise<unknown>}
 */
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

export const fetchWikiPageBySlug = fetchPageBySlug;

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

function markdownToHtmlFallback(content) {
    const source = String(content || '').replace(/\r\n/g, '\n').trim();
    if (!source) {
        return '<p>Страница пуста.</p>';
    }

    const blocks = source.split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);
    return blocks
        .map((block) => {
            if (/^<img\b/i.test(block)) {
                return block;
            }
            if (/^<(?:span|kbd|mark|del|code|strong|em)\b/i.test(block)) {
                return `<p>${block}</p>`;
            }
            if (/^!\[[^\]]*]\([^)]+\)$/.test(block)) {
                const imageMatch = block.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
                if (imageMatch) {
                    const alt = escapeHtml(imageMatch[1] || 'Изображение');
                    const src = escapeHtml(imageMatch[2]);
                    return `<p><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></p>`;
                }
            }
            if (block.startsWith('>')) {
                return `<blockquote>${applyInlineMarkdown(block.replace(/^>\s?/, ''))}</blockquote>`;
            }
            if (block.startsWith('### ')) {
                return `<h3>${applyInlineMarkdown(block.slice(4))}</h3>`;
            }
            if (block.startsWith('## ')) {
                return `<h2>${applyInlineMarkdown(block.slice(3))}</h2>`;
            }
            if (block.startsWith('# ')) {
                return `<h1>${applyInlineMarkdown(block.slice(2))}</h1>`;
            }
            if (/^\d+\.\s/.test(block)) {
                const items = block
                    .split(/\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => `<li>${applyInlineMarkdown(line.replace(/^\d+\.\s*/, ''))}</li>`)
                    .join('');
                return `<ol>${items}</ol>`;
            }
            if (/^[-*+]\s/.test(block)) {
                const items = block
                    .split(/\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => `<li>${applyInlineMarkdown(line.replace(/^[-*+]\s*/, ''))}</li>`)
                    .join('');
                return `<ul>${items}</ul>`;
            }
            return `<p>${applyInlineMarkdown(block).replace(/\n/g, '<br>')}</p>`;
        })
        .join('\n');
}

async function resolveTransform() {
    if (transformChecked) {
        return transformFn;
    }

    transformChecked = true;
    try {
        const mod = await import('@diplodoc/transform');
        if (typeof mod.default === 'function') {
            transformFn = mod.default;
        } else if (typeof mod.transform === 'function') {
            transformFn = mod.transform;
        }
    } catch {
        transformFn = null;
    }
    return transformFn;
}

function rewriteWikiHref(href) {
    const rawHref = String(href || '').trim();
    if (!rawHref || rawHref.startsWith('#')) {
        return rawHref;
    }
    if (/^(mailto:|tel:)/i.test(rawHref)) {
        return rawHref;
    }
    if (/^javascript:/i.test(rawHref)) {
        return '';
    }

    if (/^\/wiki\/(?:#\/?|#)/i.test(rawHref) || rawHref.startsWith('/wiki/#')) {
        const hashIndex = rawHref.indexOf('#');
        const hashPart = hashIndex >= 0 ? rawHref.slice(hashIndex) : '';
        const slug = normalizeWikiSlug(decodeURIComponent(hashPart.replace(/^#\/?/, '')));
        if (!slug) {
            return '/wiki/';
        }
        return `/wiki/#/${encodeWikiHashSlug(slug)}`;
    }

    if (rawHref.startsWith('/')) {
        const slug = normalizeWikiSlug(rawHref);
        if (!slug || slug.startsWith('wiki/')) {
            return rawHref;
        }
        return `/wiki/#/${encodeWikiHashSlug(slug)}`;
    }

    try {
        const parsed = new URL(rawHref);
        if (!['https:', 'http:'].includes(parsed.protocol)) {
            return '';
        }
        if (parsed.hostname === 'wiki.yandex.ru') {
            const slug = normalizeWikiSlug(parsed.pathname);
            if (!slug) {
                return '/wiki/';
            }
            return `/wiki/#/${encodeWikiHashSlug(slug)}`;
        }
        return parsed.toString();
    } catch {
        const slug = normalizeWikiSlug(rawHref);
        if (slug) {
            return `/wiki/#/${encodeWikiHashSlug(slug)}`;
        }
        return '';
    }
}

function rewriteWikiImageSrc(src) {
    const rawSrc = String(src || '').trim();
    if (!rawSrc) {
        return rawSrc;
    }
    if (/^data:image\//i.test(rawSrc) || rawSrc.startsWith('/api/wiki/asset')) {
        return rawSrc;
    }
    if (/^https?:/i.test(rawSrc) || rawSrc.startsWith('//')) {
        return rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc;
    }
    return rawSrc;
}

function sanitizeAndRewriteHtml(html) {
    return sanitizeHtml(String(html || ''), {
        allowedTags: SAFE_HTML_ALLOWED_TAGS,
        allowedAttributes: SAFE_HTML_ALLOWED_ATTRIBUTES,
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data']
        },
        allowProtocolRelative: false,
        parseStyleAttributes: false,
        transformTags: {
            a(tagName, attribs) {
                const href = rewriteWikiHref(attribs.href || '');
                if (!href) {
                    return {
                        tagName: 'span',
                        attribs: {}
                    };
                }
                const nextAttribs = {
                    ...attribs,
                    href
                };
                if (href.startsWith('/wiki/') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                    delete nextAttribs.target;
                    delete nextAttribs.rel;
                } else {
                    nextAttribs.target = '_blank';
                    nextAttribs.rel = 'noopener noreferrer';
                }
                return { tagName, attribs: nextAttribs };
            },
            img(tagName, attribs) {
                const src = rewriteWikiImageSrc(attribs.src || '');
                if (!src) {
                    return {
                        tagName,
                        attribs: {}
                    };
                }
                return {
                    tagName,
                    attribs: {
                        ...attribs,
                        src,
                        loading: attribs.loading || 'lazy',
                        decoding: attribs.decoding || 'async'
                    }
                };
            }
        },
        exclusiveFilter(frame) {
            if (frame.tag === 'a' && !frame.attribs.href) {
                return true;
            }
            if (frame.tag === 'img' && !frame.attribs.src) {
                return true;
            }
            return false;
        }
    });
}

function looksLikeMarkdownContent(value) {
    const source = String(value || '');
    return /^#{1,6}\s/m.test(source)
        || /^#{1,6}[^#\n]+#/m.test(source)
        || /\*\*[^*\n]+\*\*/.test(source)
        || /^\s*[-*+]\s/m.test(source)
        || /!\[[^\]]*]\([^)]+\)/.test(source)
        || /\(\s*\/?[^)\s"]+\/\.files\//i.test(source)
        || /{%\s*(note|cut|toc)/i.test(source);
}

function shouldPreferYfmTransform(raw) {
    return looksLikeMarkdownContent(raw) || hasWikiYfmDirectives(raw);
}

function shouldUseHtmlSanitizeOnly(raw) {
    return isWikiWysiwygHtml(raw) && !shouldPreferYfmTransform(raw);
}

function looksLikeHtmlContent(value) {
    const source = String(value || '').trim();
    if (!source) {
        return false;
    }
    if (looksLikeMarkdownContent(source)) {
        return false;
    }
    return /^<[a-z!/]/i.test(source)
        || /<(?:p|div|h[1-6]|ul|ol|table|span|figure|section|article|blockquote)\b/i.test(source);
}

function stripHtmlToText(value) {
    return String(value || '')
        .replace(/<span[^>]*\byfm-line-number\b[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

function stripAutoListPrefix(text) {
    return String(text || '')
        .replace(/^\d+(?=[\p{L}])/u, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();
}

function removeYfmLineNumbersFromHtml(html) {
    return String(html || '')
        .replace(/<span[^>]*\byfm-line-number\b[^>]*>[\s\S]*?<\/span>\s*/gi, '');
}

function looksLikeConsoleLine(text) {
    return /(\.{2,}|\\|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|DNS|адаптер|adapter|IPv4|IPv6|маска|subnet|gateway|физический|physical)/i.test(text)
        || (/^[a-z0-9_-]{1,24}$/i.test(text) && !/\s/.test(text));
}

function consolidateTerminalLikeLists(html) {
    return String(html || '').replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, inner) => {
        const htmlItems = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
            .map((item) => removeYfmLineNumbersFromHtml(item[1]).trim());
        const items = htmlItems
            .map((item) => stripAutoListPrefix(stripHtmlToText(item)))
            .filter(Boolean);
        if (!items.length) {
            return match;
        }
        if (items.length === 2 && items[1].length <= 32 && /^[a-z0-9][a-z0-9 _\-/]{0,31}$/i.test(items[1])) {
            const firstHtml = htmlItems[0] || escapeHtml(items[0]);
            return `<p>${firstHtml}</p><pre class="wiki-console">${escapeHtml(items[1])}</pre>`;
        }
        if (items.length === 1 && /^[a-z][a-z0-9_-]{0,20}$/i.test(items[0])) {
            return `<pre class="wiki-console">${escapeHtml(items[0])}</pre>`;
        }
        if (items.length < 4) {
            return match;
        }
        const consoleLikeCount = items.filter((line) => looksLikeConsoleLine(line)).length;
        if (consoleLikeCount / items.length < 0.35) {
            return match;
        }
        return `<pre class="wiki-console">${escapeHtml(items.join('\n'))}</pre>`;
    });
}

function convertWikiKeyboardMarkup(html) {
    const replaceInlineCode = (chunk) => chunk
        .replace(/<code\b[^>]*>([^<]+)<\/code>/gi, (_, keys) => `<kbd class="wiki-kbd">${keys.trim()}</kbd>`)
        .replace(/<kbd class="wiki-kbd">([^<]+)<\/kbd>/gi, (_, keys) => `<kbd class="wiki-kbd">${keys.trim()}</kbd>`);

    return String(html || '')
        .replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => `<p${attrs}>${replaceInlineCode(inner)}</p>`)
        .replace(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi, (match, attrs, inner) => `<li${attrs}>${replaceInlineCode(inner)}</li>`)
        .replace(/\+\+(.+?)\+\+/g, (_, keys) => `<kbd class="wiki-kbd">${escapeHtml(keys.trim())}</kbd>`);
}

function sanitizeEscapedTagAttributes(rawAttrs, allowedNames) {
    const allowed = new Set(allowedNames);
    const decoded = String(rawAttrs || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const parts = [];
    const attrRe = /([a-zA-Z][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
    let match;
    while ((match = attrRe.exec(decoded))) {
        const name = match[1].toLowerCase();
        if (!allowed.has(name) || name.startsWith('on')) {
            continue;
        }
        const value = match[3] ?? match[4] ?? match[5] ?? '';
        if (name === 'src' && /^(javascript:|data:text\/html)/i.test(value)) {
            continue;
        }
        if (name === 'href' && /^javascript:/i.test(value)) {
            continue;
        }
        parts.push(`${name}="${escapeHtml(value)}"`);
    }
    return parts.join(' ');
}

function safeUnescapeWikiTags(html) {
    return String(html || '')
        .replace(/&lt;img\b([^&]*?)&gt;/gi, (_, rawAttrs) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class']);
            return attrs ? `<img ${attrs}>` : '';
        })
        .replace(/&lt;kbd\b([^&]*?)&gt;([\s\S]*?)&lt;\/kbd&gt;/gi, (_, rawAttrs, inner) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['class']);
            const safeInner = escapeHtml(String(inner || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
            return `<kbd${attrs ? ` ${attrs}` : ''}>${safeInner}</kbd>`;
        })
        .replace(/&lt;span\b([^&]*?\bwiki-color[^&]*?)&gt;([\s\S]*?)&lt;\/span&gt;/gi, (_, rawAttrs, inner) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['class']);
            const safeInner = escapeHtml(String(inner || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
            return `<span${attrs ? ` ${attrs}` : ''}>${safeInner}</span>`;
        });
}

function postProcessWikiHtml(html) {
    let result = String(html || '');

    result = result.replace(
        /(<(?:strong|b)>)([^<]+)(<\/(?:strong|b)>)\s*\1\2\3/gi,
        '$1$2$3'
    );

    result = result.replace(
        /(<p[^>]*>)([^<:]{3,}?):\s*\2(<\/p>)/gi,
        '$1$2$3'
    );

    result = result.replace(/([^<>]{8,}?):\1/g, '$1');
    result = result.replace(/^\s*!\s*$/gm, '');
    result = result.replace(/<p>\s*!\s*<\/p>/gi, '');
    result = result.replace(/<\/ol>\s*<ol[^>]*>/gi, '');
    result = safeUnescapeWikiTags(result);
    result = result.replace(/<a\b[^>]*\byfm-anchor[^>]*>[\s\S]*?<\/a>\s*/gi, '');
    result = removeYfmLineNumbersFromHtml(result);
    result = convertLegacyWikiColors(result);
    result = convertWikiKeyboardMarkup(result);
    result = consolidateTerminalLikeLists(result);
    result = convertLegacyWikiImages(result);
    result = linkifyPlainUrls(result);

    return sanitizeAndRewriteHtml(result);
}

function isWikiWysiwygHtml(value) {
    const source = String(value || '');
    return /<(?:div|span|p|table|section|article|figure|ul|ol|li)\b/i.test(source);
}

async function renderWikiContent(content, context = {}) {
    const raw = String(content || '').trim();
    if (!raw) {
        return '<p>Страница пуста.</p>';
    }

    const preprocessed = preprocessLegacyWikiMarkup(raw);
    const withTreeMacros = resolveWikiTreeMacros(preprocessed, context);
    let html = '';

    if (shouldUseHtmlSanitizeOnly(raw)) {
        html = sanitizeAndRewriteHtml(withTreeMacros);
    } else if (shouldPreferYfmTransform(raw)) {
        const transform = await resolveTransform();
        if (transform) {
            try {
                const transformed = transform(withTreeMacros, {
                    extractTitle: false,
                    needTitle: false
                });
                html = String(transformed?.result?.html || '').trim();
            } catch (error) {
                console.warn('YFM transform failed, using fallback renderer:', error instanceof Error ? error.message : error);
            }
        }
        if (!html) {
            html = markdownToHtmlFallback(withTreeMacros);
        } else {
            html = sanitizeAndRewriteHtml(html);
        }
    } else if (looksLikeHtmlContent(withTreeMacros) || isWikiWysiwygHtml(withTreeMacros)) {
        html = sanitizeAndRewriteHtml(withTreeMacros);
    } else {
        html = markdownToHtmlFallback(withTreeMacros);
    }

    html = postProcessWikiHtml(html);
    html = convertLegacyWikiImages(html);
    html = resolveWikiImagesInHtml(html, context);
    html = postProcessWikiHtml(html);
    html = resolveWikiTreeMacros(html, context);
    html = convertLegacyWikiColors(html);
    html = stripUnresolvedWikiMacros(html);
    return sanitizeAndRewriteHtml(html);
}

export async function renderWikiContentForTest(content, context = {}) {
    return renderWikiContent(content, context);
}

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

export async function getWikiSnapshotMeta() {
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

function encodeWikiHashSlug(slug) {
    return splitSlug(slug).map((part) => encodeURIComponent(part)).join('/');
}

export async function getWikiTreePayload(accessToken) {
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

export async function searchWikiPages(query, limit = 20, accessToken) {
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
        const snapshotEntries = await readWikiSearchSnapshot();
        let candidates = snapshotEntries.filter((item) => isSlugInBaseScope(item.slug, state.baseSlug));
        if (!candidates.length) {
            const treePayload = await getWikiTreePayload(accessToken);
            candidates = treePayload.items.map((item) => ({
                id: item.id,
                slug: item.slug,
                title: item.title,
                corpus: tokenizeSlug(item.slug),
                updatedAt: item.updatedAt
            }));
        }

        const queryTokens = normalizedQuery.split(' ').filter(Boolean);
        const scored = candidates
            .map((item) => {
                const title = normalizeSearchText(item.title);
                const slugText = normalizeSearchText(item.slug.replace(/\//g, ' '));
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
                        title: item.title,
                        corpus: item.corpus || '',
                        updatedAt: item.updatedAt || null,
                        href: `/wiki/#/${encodeWikiHashSlug(item.slug)}`,
                        editUrl: buildWikiExternalUrl(item.slug),
                        score
                    }
                    : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }));

        return scored.slice(0, cappedLimit);
    }, getWikiCacheTtl('search'));
}

/**
 * @param {{ pageId?: number, file?: string, src?: string, slug?: string, accessToken?: string }} params
 * @returns {string}
 */
export function getWikiAssetCacheKeyForRequest(params) {
    const normalizedSourceSlug = normalizeWikiSlug(params.slug || '');
    const remotePath = String(params.src || '').trim();
    const pathFileName = extractImageFileName(remotePath);
    const lookupName = pathFileName || String(params.file || '').trim();
    const filesPath = buildWikiFilesPath(normalizedSourceSlug, remotePath, lookupName);
    return getWikiAssetCacheKey(filesPath, params.accessToken);
}

export async function fetchWikiAssetBuffer(pageId, fileName, accessToken, remoteUrl, sourceSlug, attachmentIdRaw) {
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
