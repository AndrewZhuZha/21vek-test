import { config } from '../config.js';

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function hasSessionUser(req) {
    return Boolean(req.session && req.session.user);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAuth(req, res, next) {
    if (hasSessionUser(req)) {
        next();
        return;
    }
    res.status(401).json({ message: 'Требуется авторизация' });
}

/**
 * @param {(req: import('express').Request) => string | undefined | null} [resolveRequestType]
 * @returns {import('express').RequestHandler}
 */
export function requireAuthOrGuestRequest(resolveRequestType) {
    return (req, res, next) => {
        if (hasSessionUser(req)) {
            next();
            return;
        }

        const requestType = resolveRequestType ? resolveRequestType(req) : null;
        if (requestType && config.guestRequestTypes.includes(String(requestType))) {
            next();
            return;
        }

        res.status(401).json({ message: 'Требуется авторизация' });
    };
}
