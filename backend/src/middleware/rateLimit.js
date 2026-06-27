import rateLimit from 'express-rate-limit';

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

export const authLoginLimiter = createLimiter(15 * 60 * 1000, 20);
export const authCallbackLimiter = createLimiter(15 * 60 * 1000, 30);
export const authLogoutLimiter = createLimiter(15 * 60 * 1000, 20);
export const authMeLimiter = createLimiter(60 * 1000, 60);
export const authConfigCheckLimiter = createLimiter(60 * 1000, 60);

export const trackerIpLimiter = createLimiter(60 * 1000, 10);
export const trackerSessionLimiter = createLimiter(
    60 * 1000,
    30,
    (req) => `session:${req.sessionID || req.ip}`
);
