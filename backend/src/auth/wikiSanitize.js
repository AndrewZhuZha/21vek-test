import sanitizeHtml from 'sanitize-html';
import { normalizeWikiSlug } from './wikiScope.js';
import { encodeWikiHashSlug } from './wikiMarkup.js';

const SAFE_HTML_ALLOWED_TAGS = [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'pre',
    'code',
    'blockquote',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
    'figure',
    'kbd',
    'mark',
    'del',
    'details',
    'summary'
];
const SAFE_HTML_ALLOWED_ATTRIBUTES = {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'title', 'role', 'aria-*'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class'],
    div: ['class', 'title', 'role', 'note-type'],
    span: ['class', 'title', 'role'],
    kbd: ['class'],
    code: ['class'],
    pre: ['class'],
    table: ['class'],
    th: ['class', 'scope', 'colspan', 'rowspan'],
    td: ['class', 'colspan', 'rowspan']
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function rewriteWikiHref(href) {
    const rawHref = String(href || '').trim();
    if (!rawHref || rawHref.startsWith('#')) {
        return rawHref;
    }
    if (/^(mailto:|tel:)/i.test(rawHref)) {
        return rawHref;
    }
    if (/^javascript:/i.test(rawHref)) {
        return '';
    }

    if (/^\/wiki\/(?:#\/?|#)/i.test(rawHref) || rawHref.startsWith('/wiki/#')) {
        const hashIndex = rawHref.indexOf('#');
        const hashPart = hashIndex >= 0 ? rawHref.slice(hashIndex) : '';
        const slug = normalizeWikiSlug(decodeURIComponent(hashPart.replace(/^#\/?/, '')));
        if (!slug) {
            return '/wiki/';
        }
        return `/wiki/#/${encodeWikiHashSlug(slug)}`;
    }

    if (rawHref.startsWith('/')) {
        const slug = normalizeWikiSlug(rawHref);
        if (!slug || slug.startsWith('wiki/')) {
            return rawHref;
        }
        return `/wiki/#/${encodeWikiHashSlug(slug)}`;
    }

    try {
        const parsed = new URL(rawHref);
        if (!['https:', 'http:'].includes(parsed.protocol)) {
            return '';
        }
        if (parsed.hostname === 'wiki.yandex.ru') {
            const slug = normalizeWikiSlug(parsed.pathname);
            if (!slug) {
                return '/wiki/';
            }
            return `/wiki/#/${encodeWikiHashSlug(slug)}`;
        }
        return parsed.toString();
    } catch {
        const slug = normalizeWikiSlug(rawHref);
        if (slug) {
            return `/wiki/#/${encodeWikiHashSlug(slug)}`;
        }
        return '';
    }
}

function rewriteWikiImageSrc(src) {
    const rawSrc = String(src || '').trim();
    if (!rawSrc) {
        return rawSrc;
    }
    if (/^data:image\//i.test(rawSrc) || rawSrc.startsWith('/api/wiki/asset')) {
        return rawSrc;
    }
    if (/^https?:/i.test(rawSrc) || rawSrc.startsWith('//')) {
        return rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc;
    }
    return rawSrc;
}

function sanitizeEscapedTagAttributes(rawAttrs, allowedNames) {
    const allowed = new Set(allowedNames);
    const decoded = String(rawAttrs || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const parts = [];
    const attrRe = /([a-zA-Z][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
    let match;
    while ((match = attrRe.exec(decoded))) {
        const name = match[1].toLowerCase();
        if (!allowed.has(name) || name.startsWith('on')) {
            continue;
        }
        const value = match[3] ?? match[4] ?? match[5] ?? '';
        if (name === 'src' && /^(javascript:|data:text\/html)/i.test(value)) {
            continue;
        }
        if (name === 'href' && /^javascript:/i.test(value)) {
            continue;
        }
        parts.push(`${name}="${escapeHtml(value)}"`);
    }
    return parts.join(' ');
}

function safeUnescapeWikiTags(html) {
    return String(html || '')
        .replace(/&lt;img\b([^&]*?)&gt;/gi, (_, rawAttrs) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class']);
            return attrs ? `<img ${attrs}>` : '';
        })
        .replace(/&lt;kbd\b([^&]*?)&gt;([\s\S]*?)&lt;\/kbd&gt;/gi, (_, rawAttrs, inner) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['class']);
            const safeInner = escapeHtml(String(inner || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
            return `<kbd${attrs ? ` ${attrs}` : ''}>${safeInner}</kbd>`;
        })
        .replace(/&lt;span\b([^&]*?\bwiki-color[^&]*?)&gt;([\s\S]*?)&lt;\/span&gt;/gi, (_, rawAttrs, inner) => {
            const attrs = sanitizeEscapedTagAttributes(rawAttrs, ['class']);
            const safeInner = escapeHtml(String(inner || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
            return `<span${attrs ? ` ${attrs}` : ''}>${safeInner}</span>`;
        });
}

function sanitizeAndRewriteHtml(html) {
    return sanitizeHtml(String(html || ''), {
        allowedTags: SAFE_HTML_ALLOWED_TAGS,
        allowedAttributes: SAFE_HTML_ALLOWED_ATTRIBUTES,
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data']
        },
        allowProtocolRelative: false,
        parseStyleAttributes: false,
        transformTags: {
            a(tagName, attribs) {
                const href = rewriteWikiHref(attribs.href || '');
                if (!href) {
                    return {
                        tagName: 'span',
                        attribs: {}
                    };
                }
                const nextAttribs = {
                    ...attribs,
                    href
                };
                if (href.startsWith('/wiki/') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                    delete nextAttribs.target;
                    delete nextAttribs.rel;
                } else {
                    nextAttribs.target = '_blank';
                    nextAttribs.rel = 'noopener noreferrer';
                }
                return { tagName, attribs: nextAttribs };
            },
            img(tagName, attribs) {
                const src = rewriteWikiImageSrc(attribs.src || '');
                if (!src) {
                    return {
                        tagName,
                        attribs: {}
                    };
                }
                return {
                    tagName,
                    attribs: {
                        ...attribs,
                        src,
                        loading: attribs.loading || 'lazy',
                        decoding: attribs.decoding || 'async'
                    }
                };
            }
        },
        exclusiveFilter(frame) {
            if (frame.tag === 'a' && !frame.attribs.href) {
                return true;
            }
            if (frame.tag === 'img' && !frame.attribs.src) {
                return true;
            }
            return false;
        }
    });
}

export {
    SAFE_HTML_ALLOWED_TAGS,
    SAFE_HTML_ALLOWED_ATTRIBUTES,
    sanitizeAndRewriteHtml,
    safeUnescapeWikiTags,
    rewriteWikiHref,
    rewriteWikiImageSrc,
    escapeHtml
};
