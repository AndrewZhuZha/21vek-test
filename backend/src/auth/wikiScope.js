import { config } from '../config.js';

export function normalizeWikiSlug(value) {
    let slug = String(value || '').trim();
    if (slug.includes('%')) {
        try {
            slug = decodeURIComponent(slug);
        } catch {
            // keep raw slug
        }
    }
    return slug
        .replace(/^\/+/, '')
        .replace(/^(?:wiki\/#\/?|wiki\/|#\/?)/i, '')
        .replace(/\/+$/, '');
}

export function isSlugInBaseScope(slug, baseSlug = config.yandexWikiBaseSlug) {
    const normalizedSlug = normalizeWikiSlug(slug);
    const normalizedBase = normalizeWikiSlug(baseSlug);
    if (!normalizedSlug || !normalizedBase) {
        return false;
    }
    return normalizedSlug === normalizedBase || normalizedSlug.startsWith(`${normalizedBase}/`);
}

/**
 * @param {string} slug
 * @param {string} [baseSlug]
 * @param {string} [message]
 */
export function assertWikiSlugInScope(slug, baseSlug = config.yandexWikiBaseSlug, message) {
    if (!isSlugInBaseScope(slug, baseSlug)) {
        const error = new Error(message || 'Запрошенная страница вне разрешённого раздела Wiki.');
        error.status = 403;
        throw error;
    }
}
