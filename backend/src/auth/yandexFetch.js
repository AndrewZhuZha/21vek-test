import https from 'node:https';
import { URL } from 'node:url';
import { config } from '../config.js';

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
 * @param {string} urlString
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown }} options
 * @returns {Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>}
 */
function httpsRequest(urlString, options = {}) {
    const { method = 'GET', headers = {}, body } = options;
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
                res.on('data', (chunk) => chunks.push(chunk));
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

        req.on('error', reject);
        if (payload !== null) {
            req.write(payload);
        }
        req.end();
    });
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [init]
 * @returns {Promise<{ ok: boolean, status: number, json: () => Promise<unknown> }>}
 */
export async function yandexFetch(url, init = {}) {
    if (config.yandexOAuthTlsInsecure) {
        if (config.isProduction) {
            console.warn('YANDEX_OAUTH_TLS_INSECURE=true в production — соединение с Yandex OAuth без проверки TLS');
        } else {
            console.warn('Yandex OAuth: TLS-проверка отключена (YANDEX_OAUTH_TLS_INSECURE=true)');
        }
    }

    return httpsRequest(url, init);
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
