import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * @param {number} windowMs
 * @param {number} max
 * @param {(req: import('express').Request) => string} [keyGenerator]
 * @returns {import('express').RequestHandler}
 */
function createLimiter(windowMs, max, keyGenerator) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
        message: { message: 'Слишком много запросов. Повторите позже.' }
    });
}

/**
 * @param {number} defaultMax
 * @param {number} scaleMax
 * @returns {number}
 */
function pickLimit(defaultMax, scaleMax) {
    return config.rateLimitScaleMode ? scaleMax : defaultMax;
}

/**
 * @param {string} prefix
 * @returns {(req: import('express').Request) => string}
 */
function sessionOrIpKey(prefix) {
    return (req) => `${prefix}:${req.sessionID || req.ip}`;
}

export const authLoginLimiter = createLimiter(
    15 * 60 * 1000,
    pickLimit(20, 100)
);

export const authCallbackLimiter = createLimiter(
    15 * 60 * 1000,
    pickLimit(30, 100)
);

export const authLogoutLimiter = createLimiter(
    15 * 60 * 1000,
    pickLimit(20, 60)
);

export const authMeLimiter = createLimiter(
    60 * 1000,
    pickLimit(60, config.rateLimitAuthMeMax),
    sessionOrIpKey('auth-me')
);

export const authConfigCheckLimiter = createLimiter(
    60 * 1000,
    pickLimit(60, config.rateLimitAuthConfigCheckMax)
);

export const trackerIpLimiter = createLimiter(
    60 * 1000,
    pickLimit(10, 30)
);

export const trackerSessionLimiter = createLimiter(
    60 * 1000,
    pickLimit(30, 60),
    sessionOrIpKey('tracker')
);

export const wikiIpLimiter = createLimiter(
    60 * 1000,
    pickLimit(120, config.rateLimitWikiIpMax)
);

export const wikiSessionLimiter = createLimiter(
    60 * 1000,
    pickLimit(90, config.rateLimitWikiSessionMax),
    sessionOrIpKey('wiki')
);

export const wikiConfigCheckLimiter = createLimiter(
    60 * 1000,
    pickLimit(60, config.rateLimitAuthConfigCheckMax)
);

export const wikiAssetLimiter = createLimiter(
    60 * 1000,
    pickLimit(90, 300)
);

export const wikiAuditLimiter = createLimiter(15 * 60 * 1000, 5);

export const healthLimiter = createLimiter(
    60 * 1000,
    pickLimit(120, config.rateLimitHealthMax)
);
