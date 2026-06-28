import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { normalizeWikiSlug } from './wikiScope.js';

/**
 * Service token → shared cache. Delegated OAuth → per-token segment.
 * @param {string | undefined} accessToken
 */
export function getWikiCacheAuthSegment(accessToken) {
    const serviceToken = String(config.yandexWikiOAuthToken || '').trim();
    if (serviceToken) {
        return 'svc';
    }
    const token = String(accessToken || '').trim();
    if (!token) {
        return 'anon';
    }
    return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/**
 * @param {string | undefined} rawSlug
 * @param {string | undefined} accessToken
 */
export function getWikiPageCacheKey(rawSlug, accessToken, baseSlug = config.yandexWikiBaseSlug) {
    const slug = normalizeWikiSlug(rawSlug || baseSlug);
    const authSeg = getWikiCacheAuthSegment(accessToken);
    return slug ? `page:v21:${authSeg}:${slug}` : '';
}

/**
 * @param {string | undefined} accessToken
 */
export function getWikiTreeCacheKey(accessToken, baseSlug = config.yandexWikiBaseSlug) {
    const normalizedBase = normalizeWikiSlug(baseSlug);
    const authSeg = getWikiCacheAuthSegment(accessToken);
    return `tree:v6:${authSeg}:${normalizedBase}`;
}

/**
 * @param {string} baseSlug
 * @param {string} normalizedQuery
 * @param {number} limit
 * @param {string | undefined} accessToken
 */
export function getWikiSearchCacheKey(baseSlug, normalizedQuery, limit, accessToken) {
    const authSeg = getWikiCacheAuthSegment(accessToken);
    const cappedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    return `search:v2:${authSeg}:${normalizeWikiSlug(baseSlug)}:${normalizedQuery}:${cappedLimit}`;
}

/**
 * @param {string} filesPath
 * @param {string | undefined} accessToken
 */
export function getWikiAssetCacheKey(filesPath, accessToken) {
    const authSeg = getWikiCacheAuthSegment(accessToken);
    const path = String(filesPath || '').trim();
    return path ? `asset:v2:${authSeg}:${path}` : '';
}
