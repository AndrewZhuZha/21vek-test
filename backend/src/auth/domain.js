import { config } from '../config.js';

/**
 * @param {string | undefined | null} email
 * @returns {boolean}
 */
export function isAllowedEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const normalized = email.trim().toLowerCase();
    const suffix = `@${config.allowedEmailDomain}`;
    return normalized.endsWith(suffix);
}

/**
 * @param {string | undefined | null} email
 * @returns {string}
 */
export function domainRejectionMessage(email) {
    const domain = config.allowedEmailDomain;
    return `Доступ разрешён только для корпоративных учётных записей @${domain}. Ваш email: ${email || 'не указан'}.`;
}
