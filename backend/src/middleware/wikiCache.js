import { config } from '../config.js';

const DEFAULT_PREFIX = 'portal:wiki:';
const MAX_MEMORY_CACHE_ENTRIES = Number(process.env.WIKI_MEMORY_CACHE_MAX_ENTRIES) > 0
    ? Math.floor(Number(process.env.WIKI_MEMORY_CACHE_MAX_ENTRIES))
    : 2000;
const memoryCache = new Map();
const inFlightResolvers = new Map();
let redisClientPromise = null;
let redisRetryBackoffMs = 0;
let redisNextRetryAtMs = 0;
const REDIS_RETRY_MIN_MS = 5000;
const REDIS_RETRY_MAX_MS = 60000;

function nowMs() {
    return Date.now();
}

function toMemoryKey(key) {
    return `${DEFAULT_PREFIX}${String(key || '').trim()}`;
}

function cloneCacheValue(value) {
    if (value === undefined) {
        return null;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function getMemoryEntry(memoryKey) {
    const entry = memoryCache.get(memoryKey);
    if (!entry) {
        return null;
    }
    if (entry.expiresAt <= nowMs()) {
        memoryCache.delete(memoryKey);
        return null;
    }
    return cloneCacheValue(entry.value);
}

function setMemoryEntry(memoryKey, value, ttlSec) {
    const ttlMs = Math.max(1, Number(ttlSec) || config.yandexWikiCacheTtlSec || 300) * 1000;
    if (memoryCache.has(memoryKey)) {
        memoryCache.delete(memoryKey);
    }
    memoryCache.set(memoryKey, {
        value: cloneCacheValue(value),
        expiresAt: nowMs() + ttlMs
    });
    while (memoryCache.size > MAX_MEMORY_CACHE_ENTRIES) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        memoryCache.delete(oldestKey);
    }
}

function scheduleRedisRetry(error) {
    redisRetryBackoffMs = redisRetryBackoffMs
        ? Math.min(redisRetryBackoffMs * 2, REDIS_RETRY_MAX_MS)
        : REDIS_RETRY_MIN_MS;
    redisNextRetryAtMs = nowMs() + redisRetryBackoffMs;
    redisClientPromise = null;
    console.error(
        `Wiki cache redis unavailable (retry in ${Math.ceil(redisRetryBackoffMs / 1000)}s):`,
        error instanceof Error ? error.message : error
    );
}

function markRedisHealthy() {
    redisRetryBackoffMs = 0;
    redisNextRetryAtMs = 0;
}

function markRedisClientBroken(error) {
    try {
        if (redisClientPromise) {
            redisClientPromise
                .then((client) => {
                    if (client && typeof client.quit === 'function') {
                        return client.quit().catch(() => {});
                    }
                    return null;
                })
                .catch(() => {});
        }
    } catch {
        // noop
    }
    scheduleRedisRetry(error);
}

function canUseRedisNow() {
    if (config.sessionStore !== 'redis' || !config.sessionRedisUrl) {
        return false;
    }
    if (!redisNextRetryAtMs) {
        return true;
    }
    return nowMs() >= redisNextRetryAtMs;
}

async function getRedisClient() {
    if (!canUseRedisNow()) {
        return null;
    }

    if (!redisClientPromise) {
        redisClientPromise = (async () => {
            try {
                const { createClient } = await import('redis');
                const client = createClient({ url: config.sessionRedisUrl });
                client.on('error', (error) => {
                    console.error('Wiki cache redis error:', error);
                });
                await client.connect();
                markRedisHealthy();
                return client;
            } catch (error) {
                scheduleRedisRetry(error);
                return null;
            }
        })();
    }

    return redisClientPromise;
}

export async function getWikiCacheValue(key) {
    const memoryKey = toMemoryKey(key);
    const memoryValue = getMemoryEntry(memoryKey);
    if (memoryValue !== null) {
        return memoryValue;
    }

    const redis = await getRedisClient();
    if (!redis || typeof redis.get !== 'function') {
        return null;
    }

    try {
        const payload = await redis.get(memoryKey);
        if (!payload) {
            return null;
        }
        const parsed = JSON.parse(payload);
        setMemoryEntry(memoryKey, parsed, config.yandexWikiCacheTtlSec);
        return cloneCacheValue(parsed);
    } catch (error) {
        console.error('Wiki cache read failed:', error instanceof Error ? error.message : error);
        markRedisClientBroken(error);
        return null;
    }
}

export async function setWikiCacheValue(key, value, ttlSec = config.yandexWikiCacheTtlSec) {
    const memoryKey = toMemoryKey(key);
    setMemoryEntry(memoryKey, value, ttlSec);

    const redis = await getRedisClient();
    if (!redis || typeof redis.set !== 'function') {
        return;
    }

    try {
        const ttl = Math.max(1, Number(ttlSec) || config.yandexWikiCacheTtlSec || 300);
        const payload = JSON.stringify(value);
        if (typeof redis.setEx === 'function') {
            await redis.setEx(memoryKey, ttl, payload);
            return;
        }
        await redis.set(memoryKey, payload, { EX: ttl });
    } catch (error) {
        console.error('Wiki cache write failed:', error instanceof Error ? error.message : error);
        markRedisClientBroken(error);
    }
}

export async function withWikiCache(key, resolver, ttlSec = config.yandexWikiCacheTtlSec) {
    const inFlightKey = toMemoryKey(key);
    const cached = await getWikiCacheValue(key);
    if (cached !== null) {
        return cached;
    }

    if (inFlightResolvers.has(inFlightKey)) {
        return inFlightResolvers.get(inFlightKey);
    }

    const resolvingPromise = (async () => {
        try {
            const resolved = await resolver();
            await setWikiCacheValue(key, resolved, ttlSec);
            return resolved;
        } finally {
            inFlightResolvers.delete(inFlightKey);
        }
    })();

    inFlightResolvers.set(inFlightKey, resolvingPromise);
    return resolvingPromise;
}

export function getWikiCacheDiagnostics() {
    const redisConfigured = Boolean(config.sessionStore === 'redis' && config.sessionRedisUrl);
    const retryAfterMs = redisNextRetryAtMs > nowMs() ? redisNextRetryAtMs - nowMs() : 0;
    return {
        mode: redisConfigured ? 'redis+memory' : 'memory',
        redisConfigured,
        redisDegraded: redisConfigured && Boolean(retryAfterMs),
        redisRetryAfterMs: retryAfterMs,
        inFlightKeys: inFlightResolvers.size,
        memoryEntries: memoryCache.size
    };
}
