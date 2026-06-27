import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const requestTypesPath = path.join(config.projectRoot, 'data', 'request-types.json');

/**
 * @returns {Set<string>}
 */
function loadAllowedRequestTypes() {
    try {
        const raw = fs.readFileSync(requestTypesPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return new Set();
        }
        return new Set(Object.keys(parsed));
    } catch (error) {
        console.warn('Не удалось прочитать data/request-types.json, whitelist requestType отключён.');
        return new Set();
    }
}

const allowedRequestTypes = loadAllowedRequestTypes();

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {{ max: number, required?: boolean, fallback?: string }} options
 * @returns {string}
 */
function normalizeText(value, fieldName, options) {
    const { max, required = true, fallback = '' } = options;

    if (value === undefined || value === null) {
        if (required) {
            throw new Error(`Поле ${fieldName} обязательно`);
        }
        return fallback;
    }

    const text = String(value).trim();
    if (!text) {
        if (required) {
            throw new Error(`Поле ${fieldName} обязательно`);
        }
        return fallback;
    }

    if (text.length > max) {
        throw new Error(`Поле ${fieldName} превышает лимит ${max} символов`);
    }

    return text;
}

/**
 * @param {unknown} payload
 * @returns {{
 *  queue: string,
 *  summary: string,
 *  description: string,
 *  source: string,
 *  requestType: string,
 *  clientRequestId: string | null
 * }}
 */
export function validateIssuePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Некорректный payload заявки');
    }

    const body = /** @type {Record<string, unknown>} */ (payload);
    const requestType = normalizeText(body.requestType, 'requestType', { max: 80 });

    if (allowedRequestTypes.size > 0 && !allowedRequestTypes.has(requestType)) {
        throw new Error('Неизвестный тип заявки');
    }

    const queue = normalizeText(body.queue, 'queue', { max: 64, required: false, fallback: 'ITHELP' });
    const summary = normalizeText(body.summary, 'summary', { max: 300 });
    const description = normalizeText(body.description, 'description', { max: 4000 });
    const source = normalizeText(body.source, 'source', { max: 64, required: false, fallback: 'web-form' });
    const clientRequestId = normalizeText(body.clientRequestId, 'clientRequestId', {
        max: 120,
        required: false,
        fallback: ''
    });

    return {
        queue,
        summary,
        description,
        source,
        requestType,
        clientRequestId: clientRequestId || null
    };
}

/**
 * @param {unknown} payload
 * @returns {{
 *  target: string,
 *  requester: string,
 *  reason: string,
 *  source: string,
 *  clientRequestId: string | null
 * }}
 */
export function validatePasswordResetPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Некорректный payload запроса на сброс пароля');
    }

    const body = /** @type {Record<string, unknown>} */ (payload);
    const target = normalizeText(body.target, 'target', { max: 160 });
    const requester = normalizeText(body.requester, 'requester', { max: 160 });
    const reason = normalizeText(body.reason, 'reason', { max: 4000 });
    const source = normalizeText(body.source, 'source', { max: 64, required: false, fallback: 'web-reset' });
    const clientRequestId = normalizeText(body.clientRequestId, 'clientRequestId', {
        max: 120,
        required: false,
        fallback: ''
    });

    return {
        target,
        requester,
        reason,
        source,
        clientRequestId: clientRequestId || null
    };
}

/**
 * @param {{ displayName: string, email: string } | null} user
 * @returns {{ reporterName: string | null, reporterEmail: string | null }}
 */
export function buildReporter(user) {
    return {
        reporterName: user?.displayName || null,
        reporterEmail: user?.email || null
    };
}
