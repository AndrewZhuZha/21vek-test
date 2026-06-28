import { config } from '../config.js';
import { yandexFetch } from './yandexFetch.js';

const DIRECTORY_API_BASE = 'https://api360.yandex.net/directory/v1';
const ORG_ID_CACHE_MS = 10 * 60 * 1000;
const POSITION_CACHE_MS = 24 * 60 * 60 * 1000;

/** @type {{ id: string | null, expiresAt: number } | null} */
let orgIdCache = null;

/** @type {Map<string, { position: string | null, department: string | null, expiresAt: number }>} */
const positionCache = new Map();

/** @type {Map<string, Promise<{ position: string | null, department: string | null } | null>>} */
const directoryInFlight = new Map();

/**
 * @param {string | undefined | null} value
 * @returns {Set<string>}
 */
function buildIdentityKeys(email, login) {
    const keys = new Set();

    const add = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) {
            return;
        }
        keys.add(normalized);
        if (normalized.includes('@')) {
            keys.add(normalized.split('@')[0]);
        }
    };

    add(email);
    add(login);
    return keys;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Set<string>}
 */
function directoryUserKeys(item) {
    const keys = new Set();

    const add = (value) => {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) {
            return;
        }
        keys.add(normalized);
        if (normalized.includes('@')) {
            keys.add(normalized.split('@')[0]);
        }
    };

    add(item.email);
    add(item.nickname);
    add(item.login);
    add(item.id);

    if (Array.isArray(item.aliases)) {
        item.aliases.forEach((alias) => add(alias));
    }

    if (Array.isArray(item.contacts)) {
        item.contacts.forEach((contact) => {
            if (!contact || typeof contact !== 'object') {
                return;
            }
            const contactRecord = /** @type {Record<string, unknown>} */ (contact);
            add(contactRecord.value);
        });
    }

    return keys;
}

/**
 * @param {Record<string, unknown>} item
 * @param {Set<string>} identityKeys
 * @returns {boolean}
 */
function usersMatch(item, identityKeys) {
    const userKeys = directoryUserKeys(item);
    for (const key of identityKeys) {
        if (userKeys.has(key)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {string} accessToken
 * @param {Record<string, unknown>} user
 * @returns {Promise<{ position: string | null, department: string | null } | null>}
 */
function extractDirectoryMeta(user) {
    const position = String(
        user.position || user.jobTitle || user.job_title || user.title || ''
    ).trim() || null;
    return {
        position,
        department: null
    };
}

/**
 * @param {string} email
 * @param {{ position: string | null, department: string | null }} meta
 */
export function cacheDirectoryMeta(email, meta) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !meta?.position) {
        return;
    }

    positionCache.set(normalizedEmail, {
        position: meta.position,
        department: meta.department || null,
        expiresAt: Date.now() + POSITION_CACHE_MS
    });
}

/**
 * @param {string} email
 * @returns {{ position: string | null, department: string | null } | null}
 */
export function getCachedDirectoryMeta(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        return null;
    }

    const cached = positionCache.get(normalizedEmail);
    if (!cached || cached.expiresAt <= Date.now()) {
        positionCache.delete(normalizedEmail);
        return null;
    }

    return {
        position: cached.position,
        department: cached.department
    };
}

/**
 * @param {string} accessToken
 * @param {string | number} orgId
 * @param {number | string} departmentId
 * @returns {Promise<string | null>}
 */
async function fetchDepartmentName(accessToken, orgId, departmentId) {
    try {
        const response = await yandexFetch(
            `${DIRECTORY_API_BASE}/org/${orgId}/departments/${departmentId}`,
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`,
                    Accept: 'application/json'
                }
            }
        );
        const data = await response.json();
        if (!response.ok) {
            return null;
        }
        const name = String(data?.name || '').trim();
        return name || null;
    } catch (error) {
        return null;
    }
}

/**
 * @param {string} accessToken
 * @param {string | number} orgId
 * @param {Record<string, unknown>} user
 * @returns {Promise<{ position: string | null, department: string | null } | null>}
 */
async function buildMetaFromDirectoryUser(accessToken, orgId, user) {
    const meta = extractDirectoryMeta(user);
    if (user.departmentId) {
        meta.department = await fetchDepartmentName(accessToken, orgId, user.departmentId);
    }
    return meta;
}

/**
 * @param {string} accessToken
 * @returns {Promise<string | null>}
 */
async function resolveOrganizationId(accessToken) {
    if (config.yandex360OrgId) {
        return config.yandex360OrgId;
    }

    if (orgIdCache && orgIdCache.expiresAt > Date.now() && orgIdCache.id) {
        return orgIdCache.id;
    }

    try {
        const response = await yandexFetch(`${DIRECTORY_API_BASE}/org?perPage=100`, {
            headers: {
                Authorization: `OAuth ${accessToken}`,
                Accept: 'application/json'
            }
        });
        const data = await response.json();
        if (!response.ok) {
            console.warn('Yandex 360 organizations:', data?.message || response.status);
            return null;
        }

        const organizations = Array.isArray(data?.organizations) ? data.organizations : [];
        if (organizations.length === 0) {
            return null;
        }

        const preferred = organizations.find((org) => {
            const name = String(org?.name || '').toLowerCase();
            const email = String(org?.email || '').toLowerCase();
            return name.includes('21vek') || email.includes('21vek');
        });

        const org = preferred || organizations[0];
        const orgId = org?.id !== undefined && org?.id !== null ? String(org.id) : null;
        if (orgId) {
            orgIdCache = { id: orgId, expiresAt: Date.now() + ORG_ID_CACHE_MS };
        }
        return orgId;
    } catch (error) {
        console.warn('Yandex 360 org lookup failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * @param {string} accessToken
 * @param {string | number} orgId
 * @param {string} userKey
 * @returns {Promise<{ position: string | null, department: string | null } | null>}
 */
async function fetchDirectoryUserByKey(accessToken, orgId, userKey) {
    if (!userKey) {
        return null;
    }

    try {
        const response = await yandexFetch(
            `${DIRECTORY_API_BASE}/org/${orgId}/users/${encodeURIComponent(userKey)}`,
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`,
                    Accept: 'application/json'
                }
            }
        );
        const data = await response.json();
        if (!response.ok) {
            return null;
        }
        return buildMetaFromDirectoryUser(accessToken, orgId, data);
    } catch (error) {
        return null;
    }
}

/**
 * @param {string} accessToken
 * @param {string | number} orgId
 * @param {Set<string>} identityKeys
 * @returns {Promise<{ position: string | null, department: string | null } | null>}
 */
async function findDirectoryUserInList(accessToken, orgId, identityKeys, maxPages = 20) {
    let page = 1;

    while (page <= maxPages) {
        const response = await yandexFetch(
            `${DIRECTORY_API_BASE}/org/${orgId}/users?page=${page}&perPage=1000`,
            {
                headers: {
                    Authorization: `OAuth ${accessToken}`,
                    Accept: 'application/json'
                }
            }
        );
        const data = await response.json();
        if (!response.ok) {
            console.warn('Yandex 360 users list:', data?.message || response.status);
            return null;
        }

        const users = Array.isArray(data?.users) ? data.users : [];
        const match = users.find((item) => usersMatch(item, identityKeys));
        if (match) {
            const listedMeta = await buildMetaFromDirectoryUser(accessToken, orgId, match);
            if (listedMeta?.position) {
                return listedMeta;
            }

            if (match.id) {
                const fullMeta = await fetchDirectoryUserByKey(accessToken, orgId, String(match.id));
                if (fullMeta?.position) {
                    return fullMeta;
                }
            }

            return listedMeta;
        }

        const pages = Number(data?.pages) || 1;
        if (page >= pages || users.length === 0) {
            break;
        }
        page += 1;
    }

    return null;
}

/**
 * @param {string} accessToken
 * @param {string} email
 * @param {string} login
 * @param {{ skipListScan?: boolean, maxListPages?: number }} [options]
 * @returns {Promise<{ position: string | null, department: string | null } | null>}
 */
export async function fetchDirectoryUserMeta(accessToken, email, login, options = {}) {
    if (!config.yandex360UseDirectory || !accessToken) {
        return null;
    }

    const skipListScan = options.skipListScan === true;
    const maxListPages = Number(options.maxListPages) > 0 ? Number(options.maxListPages) : 20;

    const identityKeys = buildIdentityKeys(email, login);
    if (identityKeys.size === 0) {
        return null;
    }

    try {
        const orgId = await resolveOrganizationId(accessToken);
        if (!orgId) {
            console.warn('Yandex 360: не удалось определить orgId. Задайте YANDEX360_ORG_ID в backend/.env');
            return null;
        }

        const lookupKeys = [
            login,
            email,
            email.includes('@') ? email.split('@')[0] : ''
        ].map((value) => String(value || '').trim()).filter(Boolean);

        const directResults = await Promise.all(
            lookupKeys.map((userKey) => fetchDirectoryUserByKey(accessToken, orgId, userKey))
        );
        const directWithPosition = directResults.find((meta) => meta?.position);
        if (directWithPosition) {
            return directWithPosition;
        }

        if (skipListScan) {
            return directResults.find(Boolean) || null;
        }

        const listedMeta = await findDirectoryUserInList(accessToken, orgId, identityKeys, maxListPages);
        if (listedMeta?.position) {
            return listedMeta;
        }

        return listedMeta || directResults.find(Boolean) || null;
    } catch (error) {
        console.warn('Yandex 360 Directory lookup failed:', error instanceof Error ? error.message : error);
        return null;
    }
}

/**
 * @param {string | null | undefined} accessToken
 * @param {{ email: string, login: string, position?: string | null, department?: string | null }} user
 * @param {{ skipListScan?: boolean, timeoutMs?: number }} [options]
 * @returns {Promise<{ email: string, login: string, position?: string | null, department?: string | null }>}
 */
export async function enrichUserFromDirectory(accessToken, user, options = {}) {
    if (user.position) {
        return user;
    }

    const cachedMeta = getCachedDirectoryMeta(user.email);
    if (cachedMeta?.position) {
        return {
            ...user,
            position: cachedMeta.position,
            department: cachedMeta.department || user.department || null
        };
    }

    if (!accessToken) {
        return user;
    }

    const inFlightKey = String(user.email || user.login || '').trim().toLowerCase();
    if (inFlightKey && directoryInFlight.has(inFlightKey)) {
        const directoryMeta = await directoryInFlight.get(inFlightKey);
        if (!directoryMeta) {
            return user;
        }
        cacheDirectoryMeta(user.email, directoryMeta);
        return {
            ...user,
            position: directoryMeta.position || user.position || null,
            department: directoryMeta.department || user.department || null
        };
    }

    const fetchMeta = fetchDirectoryUserMeta(accessToken, user.email, user.login, options);
    const timeoutMs = Number(options.timeoutMs) || 0;
    const resolvingPromise = timeoutMs > 0
        ? Promise.race([
            fetchMeta,
            new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
        ])
        : fetchMeta;

    if (inFlightKey) {
        directoryInFlight.set(inFlightKey, resolvingPromise);
    }

    let directoryMeta;
    try {
        directoryMeta = await resolvingPromise;
    } finally {
        if (inFlightKey) {
            directoryInFlight.delete(inFlightKey);
        }
    }

    if (!directoryMeta) {
        console.warn(`Yandex 360: должность не найдена для ${user.email || user.login}`);
        return user;
    }

    cacheDirectoryMeta(user.email, directoryMeta);

    return {
        ...user,
        position: directoryMeta.position || user.position || null,
        department: directoryMeta.department || user.department || null
    };
}
