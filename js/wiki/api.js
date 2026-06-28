/** API-клиент Wiki reader (/api/wiki/*). */

(function () {

    class WikiApiError extends Error {

        /**
         * @param {number} status
         * @param {string} message
         */
        constructor(status, message) {
            super(message || 'Wiki API request failed');
            this.name = 'WikiApiError';
            this.status = Number(status) || 500;
        }

    }

    const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
    const CONFIG_CACHE_TTL_MS = 60 * 1000;
    const TREE_CACHE_SCHEMA = 5;

    const pageCache = new Map();
    const treeCache = { payload: null, ts: 0, schema: 0 };
    const configCache = { payload: null, ts: 0 };
    const prefetchInFlight = new Map();
    const etagByKey = new Map();

    function readCacheEntry(map, key) {
        const entry = map.get(key);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.ts > SESSION_CACHE_TTL_MS) {
            map.delete(key);
            return null;
        }
        return entry.payload;
    }

    function writeCacheEntry(map, key, payload) {
        map.set(key, { payload, ts: Date.now() });
    }

    /**
     * @param {string} pathname
     * @param {Record<string, string | number | boolean>} [params]
     * @param {{ signal?: AbortSignal, etagKey?: string, fallback?: () => unknown }} [options]
     * @returns {Promise<unknown>}
     */
    async function request(pathname, params = {}, options = {}) {
        const url = new URL(pathname, window.location.origin);
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            url.searchParams.set(key, String(value));
        });

        const headers = { Accept: 'application/json' };
        const etagKey = options.etagKey;
        if (etagKey && etagByKey.has(etagKey)) {
            headers['If-None-Match'] = etagByKey.get(etagKey);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'same-origin',
            headers,
            signal: options.signal
        });

        if (response.status === 304 && etagKey && typeof options.fallback === 'function') {
            const cachedPayload = options.fallback();
            if (cachedPayload) {
                return cachedPayload;
            }
        }

        const responseEtag = response.headers.get('ETag');
        if (etagKey && responseEtag) {
            etagByKey.set(etagKey, responseEtag);
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && typeof payload === 'object'
                ? String(payload.message || '')
                : '';
            throw new WikiApiError(response.status, message || `HTTP ${response.status}`);
        }

        return payload;
    }

    window.PortalWikiApi = {

        /**
         * @returns {Promise<{ enabled: boolean, configured: boolean, externalUrl: string }>}
         */
        getConfig() {
            if (configCache.payload && Date.now() - configCache.ts <= CONFIG_CACHE_TTL_MS) {
                return Promise.resolve(configCache.payload);
            }
            return request('/api/wiki/config-check').then((payload) => {
                configCache.payload = payload;
                configCache.ts = Date.now();
                return payload;
            });
        },

        /**
         * @returns {Promise<{ enabled: boolean, configured: boolean, baseSlug: string, items: Array<unknown>, truncated?: boolean }>}
         */
        async getTree() {
            if (
                treeCache.payload
                && treeCache.schema === TREE_CACHE_SCHEMA
                && Date.now() - treeCache.ts <= SESSION_CACHE_TTL_MS
            ) {
                return treeCache.payload;
            }

            const payload = await request('/api/wiki/tree', {}, {
                etagKey: 'wiki:tree',
                fallback: () => treeCache.payload
            });

            treeCache.payload = payload;
            treeCache.ts = Date.now();
            treeCache.schema = TREE_CACHE_SCHEMA;
            return payload;
        },

        /**
         * @param {string} slug
         * @returns {Promise<{ title: string, slug: string, html: string, updatedAt: string | null, editUrl: string }>}
         */
        async getPage(slug) {
            const normalizedSlug = String(slug || '').trim();
            const cached = readCacheEntry(pageCache, normalizedSlug);
            if (cached) {
                return cached;
            }

            const maxAttempts = 2;
            let lastError = null;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                try {
                    const payload = await request('/api/wiki/page', { slug: normalizedSlug }, {
                        etagKey: `wiki:page:${normalizedSlug}`,
                        fallback: () => readCacheEntry(pageCache, normalizedSlug)
                    });
                    writeCacheEntry(pageCache, normalizedSlug, payload);
                    return payload;
                } catch (error) {
                    lastError = error;
                    const status = Number(error?.status || 0);
                    if (attempt + 1 >= maxAttempts || ![502, 503, 504].includes(status)) {
                        throw error;
                    }
                    await new Promise((resolve) => {
                        window.setTimeout(resolve, 400 * (attempt + 1));
                    });
                }
            }
            throw lastError;
        },

        /**
         * @param {string} slug
         * @returns {void}
         */
        prefetchPage(slug) {
            const normalizedSlug = String(slug || '').trim();
            if (!normalizedSlug || readCacheEntry(pageCache, normalizedSlug)) {
                return;
            }
            if (prefetchInFlight.has(normalizedSlug)) {
                return;
            }
            const pending = window.PortalWikiApi.getPage(normalizedSlug)
                .catch(() => null)
                .finally(() => {
                    prefetchInFlight.delete(normalizedSlug);
                });
            prefetchInFlight.set(normalizedSlug, pending);
        },

        /**
         * @param {string} query
         * @param {number} [limit]
         * @returns {Promise<{ count: number, items: Array<unknown> }>}
         */
        search(query, limit = 20, options = {}) {
            return request('/api/wiki/search', { q: query, limit }, options);
        },

        Error: WikiApiError
    };

})();
