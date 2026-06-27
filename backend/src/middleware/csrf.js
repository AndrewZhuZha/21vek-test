import { config } from '../config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * @param {string | undefined} value
 * @returns {string | null}
 */
function extractOrigin(value) {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch (error) {
        return null;
    }
}

/**
 * @param {string | null} expected
 * @param {string | null} actual
 * @returns {boolean}
 */
function originsEquivalent(expected, actual) {
    if (!expected || !actual) {
        return false;
    }
    if (expected === actual) {
        return true;
    }

    if (config.isProduction) {
        return false;
    }

    try {
        const expectedUrl = new URL(expected);
        const actualUrl = new URL(actual);
        return (
            expectedUrl.protocol === actualUrl.protocol &&
            expectedUrl.port === actualUrl.port &&
            LOOPBACK_HOSTS.has(expectedUrl.hostname) &&
            LOOPBACK_HOSTS.has(actualUrl.hostname)
        );
    } catch (error) {
        return false;
    }
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function hasAllowedOrigin(req) {
    const expectedOrigin = extractOrigin(config.publicUrl);
    const origin = extractOrigin(req.get('origin'));
    const refererOrigin = extractOrigin(req.get('referer'));

    if (origin && originsEquivalent(expectedOrigin, origin)) {
        return true;
    }

    if (!origin && refererOrigin && originsEquivalent(expectedOrigin, refererOrigin)) {
        return true;
    }

    return false;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireSameOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    if (hasAllowedOrigin(req)) {
        next();
        return;
    }

    res.status(403).json({ message: 'CSRF-проверка не пройдена' });
}
