import https from 'node:https';
import { URL } from 'node:url';
import { config } from '../config.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const ALLOWED_BINARY_FETCH_HOSTS = [
    'api.wiki.yandex.net',
    'wiki.yandex.ru',
    'storage.yandexcloud.net',
    'downloader.disk.yandex.net',
    'downloader.disk.yandex.ru'
];

function isAllowedBinaryFetchHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return ALLOWED_BINARY_FETCH_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
}

function isAllowedBinaryFetchUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        if (parsed.protocol !== 'https:') {
            return false;
        }
        if (isPublicAssetUrl(urlString)) {
            return true;
        }
        return isAllowedBinaryFetchHost(parsed.hostname);
    } catch {
        return false;
    }
}

/**
 * @param {unknown} body
 * @returns {string | Buffer | Uint8Array | null}
 */
function normalizeRequestBody(body) {
    if (body === undefined || body === null) {
        return null;
    }
    if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
        return body;
    }
    if (typeof body.toString === 'function') {
        return body.toString();
    }
    return String(body);
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function createRequestError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

/**
 * @param {string} urlString
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown, timeoutMs?: number, maxResponseBytes?: number }} options
 * @returns {Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>}
 */
function httpsRequest(urlString, options = {}) {
    const {
        method = 'GET',
        headers = {},
        body,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = options;
    const payload = normalizeRequestBody(body);
    const requestHeaders = { ...headers };

    if (payload !== null && requestHeaders['Content-Length'] === undefined) {
        requestHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const req = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method,
                headers: requestHeaders,
                rejectUnauthorized: !config.yandexOAuthTlsInsecure
            },
            (res) => {
                const chunks = [];
                let totalBytes = 0;
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                    totalBytes += Buffer.byteLength(chunk);
                    if (totalBytes > maxResponseBytes) {
                        req.destroy(createRequestError('RESPONSE_TOO_LARGE', `Response exceeded ${maxResponseBytes} bytes`));
                    }
                });
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        async json() {
                            try {
                                return JSON.parse(text || '{}');
                            } catch (error) {
                                return {};
                            }
                        }
                    });
                });
            }
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy(createRequestError('REQUEST_TIMEOUT', `Request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        if (payload !== null) {
            req.write(payload);
        }
        req.end();
    });
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string, timeoutMs?: number, maxResponseBytes?: number }} [init]
 * @returns {Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>}
 */
let tlsWarningShown = false;

export async function yandexFetch(url, init = {}) {
    if (config.yandexOAuthTlsInsecure && !tlsWarningShown) {
        tlsWarningShown = true;
        if (config.isProduction) {
            console.warn('YANDEX_OAUTH_TLS_INSECURE=true в production — соединение с Yandex OAuth без проверки TLS');
        } else {
            console.warn('Yandex OAuth: TLS-проверка отключена (YANDEX_OAUTH_TLS_INSECURE=true)');
        }
    }

    return httpsRequest(url, init);
}

/**
 * @param {string} urlString
 * @param {{ method?: string, headers?: Record<string, string>, timeoutMs?: number, maxResponseBytes?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, buffer: Buffer, contentType: string | null }>}
 */
function isPublicAssetUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        const host = parsed.hostname.toLowerCase();
        if (host.includes('storage.yandexcloud.net') || host.includes('downloader.disk.yandex')) {
            return true;
        }
        return parsed.searchParams.has('X-Amz-Signature')
            || parsed.searchParams.has('Signature')
            || parsed.searchParams.has('signature');
    } catch {
        return false;
    }
}

function binaryFetchHeaders(urlString, headers = {}) {
    if (isPublicAssetUrl(urlString)) {
        return { Accept: '*/*' };
    }
    return headers;
}

export function yandexFetchBinary(urlString, options = {}, redirectCount = 0) {
    const MAX_REDIRECTS = 5;
    if (!isAllowedBinaryFetchUrl(urlString)) {
        return Promise.reject(createRequestError('url_not_allowed', 'Binary fetch URL is not allowed'));
    }
    const {
        method = 'GET',
        headers = {},
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    } = options;
    const requestHeaders = binaryFetchHeaders(urlString, headers);

    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const req = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || 443,
                path: `${url.pathname}${url.search}`,
                method,
                headers: requestHeaders,
                rejectUnauthorized: !config.yandexOAuthTlsInsecure
            },
            (res) => {
                const statusCode = res.statusCode || 0;
                if ([301, 302, 303, 307, 308].includes(statusCode) && redirectCount < MAX_REDIRECTS) {
                    const location = String(res.headers.location || '').trim();
                    if (location) {
                        const nextUrl = new URL(location, urlString).toString();
                        if (!isAllowedBinaryFetchUrl(nextUrl)) {
                            reject(createRequestError('redirect_blocked', 'Redirect target is not allowed'));
                            res.resume();
                            return;
                        }
                        yandexFetchBinary(nextUrl, {
                            ...options,
                            headers: binaryFetchHeaders(nextUrl, headers)
                        }, redirectCount + 1).then(resolve).catch(reject);
                        res.resume();
                        return;
                    }
                }

                const chunks = [];
                let totalBytes = 0;
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                    totalBytes += Buffer.byteLength(chunk);
                    if (totalBytes > maxResponseBytes) {
                        req.destroy(createRequestError('RESPONSE_TOO_LARGE', `Response exceeded ${maxResponseBytes} bytes`));
                    }
                });
                res.on('end', () => {
                    resolve({
                        ok: statusCode >= 200 && statusCode < 300,
                        status: statusCode,
                        buffer: Buffer.concat(chunks),
                        contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null
                    });
                });
            }
        );

        req.setTimeout(timeoutMs, () => {
            req.destroy(createRequestError('REQUEST_TIMEOUT', `Request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatYandexOAuthError(error) {
    if (!(error instanceof Error)) {
        return 'Ошибка входа через Yandex. Попробуйте снова.';
    }

    const cause = error.cause;
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';

    if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return 'Корпоративный прокси блокирует HTTPS к Yandex OAuth. Для dev добавьте YANDEX_OAUTH_TLS_INSECURE=true в backend/.env или укажите корневой сертификат в NODE_EXTRA_CA_CERTS.';
    }

    if (error.message === 'fetch failed') {
        return 'Не удалось связаться с серверами Yandex OAuth. Проверьте интернет, прокси и firewall.';
    }

    return error.message;
}
