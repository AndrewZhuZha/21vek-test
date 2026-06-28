const WIKI_COLOR_ALIASES = {
    red: 'red',
    крас: 'red',
    красный: 'red',
    green: 'green',
    зел: 'green',
    зеленый: 'green',
    blue: 'blue',
    син: 'blue',
    синий: 'blue',
    cyan: 'cyan',
    голуб: 'cyan',
    голубой: 'cyan',
    grey: 'grey',
    gray: 'grey',
    сер: 'grey',
    серый: 'grey',
    yellow: 'yellow',
    жел: 'yellow',
    желтый: 'yellow',
    orange: 'orange',
    оранж: 'orange',
    оранжевый: 'orange',
    violet: 'violet',
    фиолет: 'violet',
    фиолетовый: 'violet'
};

const WIKI_MACRO_RE = /(?:\{%|\{\{)\s*-?\s*(tree|toc|note|cut|wgrid|include|iframe)\b([\s\S]*?)(?:%\}|\}\})/gi;

export function escapeWikiHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function normalizeWikiColorName(name) {
    const key = String(name || '').trim().toLowerCase();
    return WIKI_COLOR_ALIASES[key] || '';
}

export function colorSpan(colorName, text) {
    const color = normalizeWikiColorName(colorName);
    if (!color) {
        return escapeWikiHtml(text);
    }
    return `<span class="wiki-color wiki-color--${color}">${escapeWikiHtml(text)}</span>`;
}

/**
 * Legacy Yandex Wiki colors:
 * {blue}(text), !! (blue) text !!, !!red text!!
 */
export function convertLegacyWikiColors(source) {
    let text = String(source || '');

    text = text.replace(/!!\(([^)]+)\)([\s\S]*?)!!/gi, (_, colorName, inner) => colorSpan(colorName, inner));
    text = text.replace(/!!([a-zA-Zа-яА-ЯёЁ]+)\s+([\s\S]*?)!!/gi, (_, colorName, inner) => colorSpan(colorName, inner));
    text = text.replace(/\{([a-zA-Zа-яА-ЯёЁ]+)\}\(([^)]+)\)/gi, (_, colorName, inner) => colorSpan(colorName, inner));
    text = text.replace(/#\#([^#\n]+?)#\#/g, (_, inner) => `<code>${escapeWikiHtml(inner.trim())}</code>`);
    text = text.replace(/~~([^~\n]+?)~~/g, (_, inner) => `<del>${escapeWikiHtml(inner.trim())}</del>`);
    text = text.replace(/\?\?([^?\n]+?)\?\?/g, (_, inner) => `<mark>${escapeWikiHtml(inner.trim())}</mark>`);

    return text;
}

export function unwrapWikiDirectivesFromHtml(source) {
    let text = String(source || '');
    text = text.replace(/<p[^>]*>\s*(\{%[\s\S]*?%\})\s*<\/p>/gi, '$1');
    text = text.replace(/<p[^>]*>\s*(\{\{[\s\S]*?\}\})\s*<\/p>/gi, '$1');
    text = text.replace(/<div[^>]*>\s*(\{%[\s\S]*?%\})\s*<\/div>/gi, '$1');
    return text;
}

export function hasWikiYfmDirectives(source) {
    return /(?:\{%|\{\{)\s*-?\s*(note|cut|toc)\b/i.test(String(source || ''));
}

export function hasWikiTransformMarkers(source) {
    const text = String(source || '');
    return hasWikiYfmDirectives(text)
        || /\{[a-zA-Zа-яА-ЯёЁ]+\}\(/i.test(text)
        || /!!(?:\([^)]+\)|[a-zA-Zа-яА-ЯёЁ]+)/i.test(text)
        || /#\#[^#\n]+?#\#/.test(text)
        || /\+\+[^+\n]+?\+\+/.test(text);
}

export function hasWikiTreeMacro(source) {
    return /(?:\{%|\{\{)\s*-?\s*tree\b/i.test(String(source || ''));
}

export function parseWikiMacroParams(rawParams) {
    const params = {};
    const re = /(\w+)=("([^"]*)"|'([^']*)'|([^\s"']+))/g;
    let match;
    while ((match = re.exec(String(rawParams || '')))) {
        params[match[1]] = match[3] ?? match[4] ?? match[5] ?? '';
    }
    return params;
}

export function encodeWikiHashSlug(slug) {
    return String(slug || '')
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
}

function parentSlugOf(slug) {
    const parts = String(slug || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts.length <= 1) {
        return '';
    }
    return parts.slice(0, -1).join('/');
}

function normalizeWikiSlug(value) {
    return String(value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function renderTreeList(items, depth = 0) {
    if (!items.length) {
        return '<p class="wiki-tree-macro__empty">Подстраницы не найдены.</p>';
    }
    const list = items.map((item) => {
        const href = `/wiki/#/${encodeWikiHashSlug(item.slug)}`;
        const children = item.children?.length
            ? renderTreeList(item.children, depth + 1)
            : '';
        return `<li class="wiki-tree-macro__item"><a class="wiki-tree-macro__link" href="${href}">${escapeWikiHtml(item.title)}</a>${children}</li>`;
    }).join('');
    return `<ul class="wiki-tree-macro__list">${list}</ul>`;
}

function pickMacroTreeTitle(slug, fallbackTitle, titlesBySlug) {
    const normalized = normalizeWikiSlug(slug);
    const mapped = String(titlesBySlug?.[normalized] || '').trim();
    if (mapped) {
        return mapped;
    }
    return String(fallbackTitle || '').trim() || normalized;
}

function buildTreeHierarchy(items, rootSlug, maxDepth = 5, titlesBySlug = {}) {
    const root = normalizeWikiSlug(rootSlug);
    const byParent = new Map();
    items.forEach((item) => {
        const slug = normalizeWikiSlug(item.slug);
        const parent = parentSlugOf(slug) || root;
        if (!byParent.has(parent)) {
            byParent.set(parent, []);
        }
        byParent.get(parent).push({
            ...item,
            slug,
            title: pickMacroTreeTitle(slug, item.title, titlesBySlug)
        });
    });
    byParent.forEach((list) => {
        list.sort((a, b) => a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' }));
    });
    function walk(parentSlug, depth, depthLimit) {
        if (depth > depthLimit) {
            return [];
        }
        return (byParent.get(parentSlug) || []).map((item) => ({
            ...item,
            children: walk(item.slug, depth + 1, depthLimit)
        }));
    }
    return walk(root, 0, maxDepth);
}

/**
 * @param {string} html
 * @param {{ slug?: string, treeItems?: Array<{ slug: string, title: string }>, titlesBySlug?: Record<string, string> }} context
 */
export function resolveWikiTreeMacros(html, context = {}) {
    const pageSlug = normalizeWikiSlug(context.slug || '');
    const allItems = Array.isArray(context.treeItems) ? context.treeItems : [];
    const titlesBySlug = context.titlesBySlug && typeof context.titlesBySlug === 'object'
        ? { ...context.titlesBySlug }
        : {};
    allItems.forEach((item) => {
        const slug = normalizeWikiSlug(item.slug);
        const title = String(item.title || '').trim();
        if (slug && title && !titlesBySlug[slug]) {
            titlesBySlug[slug] = title;
        }
    });

    return String(html || '').replace(WIKI_MACRO_RE, (match, macroName, rawParams) => {
        if (String(macroName).toLowerCase() !== 'tree') {
            return match;
        }
        const params = parseWikiMacroParams(rawParams);
        const rootSlug = normalizeWikiSlug(params.page || pageSlug);
        const maxDepth = Math.max(1, Math.min(5, Number(params.depth) || 2));
        const scoped = allItems.filter((item) => {
            const slug = normalizeWikiSlug(item.slug);
            return slug === rootSlug || slug.startsWith(`${rootSlug}/`);
        });
        const tree = buildTreeHierarchy(scoped, rootSlug, maxDepth, titlesBySlug);
        const directChildren = tree;
        if (!directChildren.length) {
            return `<section class="wiki-tree-macro"><h3 class="wiki-tree-macro__title">Страницы раздела</h3><p class="wiki-tree-macro__empty">Подстраницы не найдены. Используйте меню слева.</p></section>`;
        }
        return `<section class="wiki-tree-macro"><h3 class="wiki-tree-macro__title">Страницы раздела</h3>${renderTreeList(directChildren.slice(0, 50))}</section>`;
    });
}

export function stripUnresolvedWikiMacros(html) {
    return String(html || '')
        .replace(
            /(?:\{%|\{\{)\s*-?\s*(toc|wgrid|include|iframe)\b[\s\S]*?(?:%\}|\}\})/gi,
            (_, macroName) => `<p class="wiki-macro-unavailable">Макрос «${escapeWikiHtml(String(macroName).toLowerCase())}» не поддерживается во встроенном reader.</p>`
        )
        .replace(/(?:\{%|\{\{)\s*-?\s*tree\b[\s\S]*?(?:%\}|\}\})/gi, '')
        .replace(/(?:\{%|\{\{)\s*-?\s*(?:note|cut)\b[\s\S]*?(?:%\}|\}\})/gi, '');
}

function safeLinkifyUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        return '';
    }
    try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return '';
        }
        return escapeWikiHtml(parsed.toString());
    } catch {
        return '';
    }
}

export function linkifyPlainUrls(html) {
    const parts = String(html || '').split(/(<[^>]+>)/g);
    return parts.map((part) => {
        if (!part || part.startsWith('<')) {
            return part;
        }
        return part.replace(
            /(^|[\s(])((https?:\/\/[^\s<>"')\]]+))/gi,
            (_, prefix, url) => {
                const safeUrl = safeLinkifyUrl(url);
                if (!safeUrl) {
                    return `${prefix}${escapeWikiHtml(url)}`;
                }
                return `${prefix}<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
            }
        );
    }).join('');
}

export function applyInlineMarkdown(text) {
    let result = String(text || '');
    result = result.replace(/\*\*([^*\n]+)\*\*/g, '§§BOLD§§$1§§/BOLD§§');
    result = result.replace(/\*([^*\n]+)\*/g, '§§EM§§$1§§/EM§§');
    result = result.replace(/_([^_\n]+)_/g, '§§EM§§$1§§/EM§§');
    result = result.replace(/(https?:\/\/[^\s<>"')\]]+)/gi, '§§LINK§§$1§§/LINK§§');
    result = escapeWikiHtml(result);
    result = result.replace(/§§BOLD§§([\s\S]*?)§§\/BOLD§§/g, '<strong>$1</strong>');
    result = result.replace(/§§EM§§([\s\S]*?)§§\/EM§§/g, '<em>$1</em>');
    result = result.replace(
        /§§LINK§§(https?:\/\/[^§]+?)§§\/LINK§§/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return result;
}
