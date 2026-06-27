import { config } from '../config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireSameOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    const expectedOrigin = config.publicUrl;
    const origin = extractOrigin(req.get('origin'));
    const refererOrigin = extractOrigin(req.get('referer'));

    if (origin === expectedOrigin || (!origin && refererOrigin === expectedOrigin)) {
        next();
        return;
    }

    res.status(403).json({ message: 'CSRF-проверка не пройдена' });
}
