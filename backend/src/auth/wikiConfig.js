import { config } from '../config.js';
import { normalizeWikiSlug } from './wikiScope.js';
import { WIKI_WEB_BASE } from './wikiConstants.js';
import { createWikiError } from './wikiErrors.js';
import { slugToLabel } from './wikiTitles.js';

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

function isWikiReaderEnabled() {
    return Boolean(config.yandexWikiEnabled && config.yandexWikiBaseSlug);
}

function isWikiApiConfigured() {
    if (!isWikiReaderEnabled() || !resolveWikiOrgId()) {
        return false;
    }
    if (config.yandexWikiOAuthToken) {
        return true;
    }
    return Boolean(config.yandexWikiEnabled && config.yandexClientId);
}

function getWikiConfigState() {
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

function buildWikiExternalUrl(slug) {
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

export {
    resolveWikiOrgId,
    resolveWikiOAuthToken,
    getWikiCacheTtl,
    ensureWikiApiReady,
    isWikiReaderEnabled,
    isWikiApiConfigured,
    getWikiConfigState,
    buildWikiExternalUrl
};
