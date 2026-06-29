import { Router } from 'express';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    wikiAssetLimiter,
    wikiAuditLimiter,
    wikiConfigCheckLimiter,
    wikiIpLimiter,
    wikiSessionLimiter
} from '../middleware/rateLimit.js';
import { getWikiCacheValue } from '../middleware/wikiCache.js';
import { getWikiSearchCacheKey } from '../auth/wikiCacheKeys.js';
import {
    getWikiConfigState,
    getWikiPageCacheKey,
    getWikiPagePayload,
    getWikiTreeCacheKey,
    getWikiTreePayload,
    getWikiAssetCacheKeyForRequest,
    normalizeWikiSlug,
    normalizeSearchText,
    searchWikiPages,
    fetchWikiAssetBuffer
} from '../auth/yandexWiki.js';
import { runWikiAudit } from '../auth/wikiAudit.js';

export const wikiRouter = Router();

wikiRouter.get('/config-check', wikiConfigCheckLimiter, async (_req, res) => {
    const state = getWikiConfigState();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
        enabled: state.enabled,
        configured: state.configured,
        externalUrl: state.externalUrl
    });
});

wikiRouter.use(wikiIpLimiter, wikiSessionLimiter);

function sendWikiError(res, error) {
    const status = Number(error?.status);
    const responseStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
    let message = error instanceof Error ? error.message : 'Wiki request failed';
    if (config.isProduction && responseStatus >= 500) {
        message = 'Internal server error';
    }
    res.status(responseStatus).json({ message });
}

const ALLOWED_ASSET_MIME = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml|svg|bmp|avif|x-icon)$/i;

function buildAssetEtag(cacheKey, buffer) {
    if (cacheKey) {
        return buildWikiEtag(cacheKey);
    }
    const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
    return `W/"asset-${digest}"`;
}

function buildWikiEtag(cacheKey) {
    return `W/"${String(cacheKey || '').replace(/"/g, '')}"`;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} cacheKey
 * @returns {Promise<unknown | null>}
 */
async function tryServeWikiCachedJson(req, res, cacheKey) {
    if (!cacheKey) {
        return null;
    }
    const cached = await getWikiCacheValue(cacheKey);
    if (cached === null) {
        return null;
    }
    const etag = buildWikiEtag(cacheKey);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return cached;
    }
    res.json(cached);
    return cached;
}

wikiRouter.get('/tree', requireAuth, async (req, res) => {
    try {
        const cacheKey = getWikiTreeCacheKey(req.session?.accessToken);
        const served = await tryServeWikiCachedJson(req, res, cacheKey);
        if (served !== null) {
            return;
        }
        const payload = await getWikiTreePayload(req.session?.accessToken);
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        res.json(payload);
    } catch (error) {
        sendWikiError(res, error);
    }
});

wikiRouter.get('/page', requireAuth, async (req, res) => {
    try {
        const slug = normalizeWikiSlug(req.query.slug || '');
        if (slug.length > 500) {
            res.status(400).json({ message: 'Slug слишком длинный' });
            return;
        }
        const cacheKey = getWikiPageCacheKey(slug || undefined, req.session?.accessToken);
        const served = await tryServeWikiCachedJson(req, res, cacheKey);
        if (served !== null) {
            return;
        }
        const payload = await getWikiPagePayload(slug || undefined, req.session?.accessToken);
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        res.json(payload);
    } catch (error) {
        sendWikiError(res, error);
    }
});

wikiRouter.get('/search', requireAuth, async (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        if (query.length > 200) {
            res.status(400).json({ message: 'Слишком длинный поисковый запрос' });
            return;
        }
        const limit = Number(req.query.limit || 20);
        const normalizedQuery = normalizeSearchText(query);
        if (normalizedQuery.length > 0 && normalizedQuery.length < 2) {
            res.json({ query, count: 0, items: [] });
            return;
        }
        const cacheKey = getWikiSearchCacheKey(
            config.yandexWikiBaseSlug,
            normalizedQuery,
            limit,
            req.session?.accessToken
        );
        const cachedItems = await getWikiCacheValue(cacheKey);
        if (cachedItems !== null) {
            const etag = buildWikiEtag(cacheKey);
            res.setHeader('Cache-Control', 'private, max-age=60');
            res.setHeader('ETag', etag);
            if (req.headers['if-none-match'] === etag) {
                res.status(304).end();
                return;
            }
            const items = Array.isArray(cachedItems) ? cachedItems : [];
            res.json({
                query,
                count: items.length,
                items
            });
            return;
        }
        const items = await searchWikiPages(query, limit, req.session?.accessToken);
        const payload = {
            query,
            count: items.length,
            items
        };
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.setHeader('ETag', buildWikiEtag(cacheKey));
        res.json(payload);
    } catch (error) {
        sendWikiError(res, error);
    }
});

wikiRouter.get('/asset', requireAuth, wikiAssetLimiter, async (req, res) => {
    try {
        const sessionToken = String(req.session?.accessToken || '').trim();
        const serviceToken = String(config.yandexWikiOAuthToken || '').trim();
        if (!sessionToken && !serviceToken) {
            res.status(401).json({
                message: 'Wiki-токен отсутствует в сессии. Выйдите из портала и войдите через Яндекс снова (нужен scope wiki:read).'
            });
            return;
        }

        const pageId = Number(req.query.pageId);
        const file = String(req.query.file || '').trim();
        const src = String(req.query.src || '').trim();
        const sourceSlug = String(req.query.slug || '').trim();
        const attachmentId = Number(req.query.attachmentId);

        if (file.length > 260 || src.length > 2000 || sourceSlug.length > 500) {
            res.status(400).json({ message: 'Некорректный запрос файла Wiki.' });
            return;
        }

        const assetCacheKey = getWikiAssetCacheKeyForRequest({
            pageId: Number.isFinite(pageId) ? pageId : 0,
            file,
            src,
            slug: sourceSlug,
            accessToken: req.session?.accessToken
        });
        if (assetCacheKey) {
            const etag = buildWikiEtag(assetCacheKey);
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            if (req.headers['if-none-match'] === etag) {
                const cached = await getWikiCacheValue(assetCacheKey);
                if (cached !== null) {
                    res.status(304).end();
                    return;
                }
            }
        }

        const payload = await fetchWikiAssetBuffer(
            Number.isFinite(pageId) ? pageId : 0,
            file,
            req.session?.accessToken,
            src,
            sourceSlug,
            Number.isFinite(attachmentId) ? attachmentId : 0
        );

        const maxAssetBytes = config.yandexWikiMaxAssetBytes;
        if (payload.buffer.length > maxAssetBytes) {
            res.status(413).json({ message: 'Файл Wiki слишком большой.' });
            return;
        }

        const contentType = String(payload.contentType || '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_ASSET_MIME.test(contentType)) {
            res.status(403).json({ message: 'Разрешена загрузка только изображений Wiki.' });
            return;
        }

        const safeFileName = String(payload.fileName || 'asset')
            .replace(/[^\w.\-()+\s]/g, '_')
            .slice(0, 120);

        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
        if (!res.getHeader('ETag')) {
            res.setHeader('ETag', buildAssetEtag(assetCacheKey, payload.buffer));
        }
        res.send(payload.buffer);
    } catch (error) {
        sendWikiError(res, error);
    }
});

wikiRouter.get('/auth-check', requireAuth, (req, res) => {
    const sessionToken = String(req.session?.accessToken || '').trim();
    const serviceToken = String(config.yandexWikiOAuthToken || '').trim();
    res.json({
        hasUser: Boolean(req.session?.user),
        hasSessionWikiToken: Boolean(sessionToken),
        hasServiceWikiToken: Boolean(serviceToken),
        wikiTokenReady: Boolean(sessionToken || serviceToken)
    });
});

wikiRouter.get('/audit', requireAuth, wikiAuditLimiter, async (req, res) => {
    try {
        if (!config.yandexWikiAuditEnabled) {
            res.status(404).json({ message: 'Wiki audit отключён.' });
            return;
        }

        const state = getWikiConfigState();
        if (!state.enabled) {
            res.status(503).json({ message: 'Wiki reader отключён.' });
            return;
        }
        if (!state.configured) {
            res.status(503).json({ message: 'Wiki API не настроен.' });
            return;
        }

        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 0;
        const probeAssets = String(req.query.probeAssets || 'true').toLowerCase() !== 'false';
        const result = await runWikiAudit(req.session?.accessToken, { limit, probeAssets });
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
        res.json(result);
    } catch (error) {
        sendWikiError(res, error);
    }
});
