import { config } from '../config.js';
import {
    applyInlineMarkdown,
    convertLegacyWikiColors,
    hasWikiYfmDirectives,
    linkifyPlainUrls,
    resolveWikiTreeMacros,
    stripUnresolvedWikiMacros,
    unwrapWikiDirectivesFromHtml
} from './wikiMarkup.js';
import { createWikiError } from './wikiErrors.js';
import {
    sanitizeAndRewriteHtml,
    safeUnescapeWikiTags,
    escapeHtml
} from './wikiSanitize.js';
import { resolveWikiImagesInHtml, normalizeWikiAssetPath } from './wikiAssets.js';

function legacyImageToTag(rawPath, altText = '') {
    const path = normalizeWikiAssetPath(String(rawPath || '').trim());
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const safeAlt = escapeHtml(String(altText || '').trim());
    return `\n\n<img src="${normalizedPath}" alt="${safeAlt}" loading="lazy" decoding="async">\n\n`;
}

function convertLegacyWikiImages(text) {
    let result = String(text || '');

    result = result.replace(
        /\(\s*(\/?[^)\s"]+?\/\.files\/[^)\s"]+?\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\s+"([^"]*)")?(?:\s*=\s*\d+x\d+)?\s*\)\s*!?/gi,
        (_, rawPath, altText) => legacyImageToTag(rawPath, altText)
    );

    result = result.replace(
        /\(\s*(\/?[^)\s"]+?\/\.files\/[^)\s"]+?\.(?:png|jpe?g|gif|webp|svg|bmp))(?:\s+"([^"]*)")?(?:\s*=\s*\d+x\d+)?\s*$/gim,
        (_, rawPath, altText) => legacyImageToTag(rawPath, altText)
    );

    result = result.replace(
        /\[([^\[\]\n]+\.(?:png|jpe?g|gif|webp|svg|bmp))\]/gi,
        (_, file) => legacyImageToTag(file)
    );

    result = result.replace(
        /(\d+)x(\d+):([^\s<)]+)/gi,
        (_, _w, _h, file) => legacyImageToTag(file)
    );

    return result;
}

function preprocessLegacyWikiMarkup(content) {
    let text = String(content || '').replace(/\r\n/g, '\n');

    text = text.replace(/\/\s+\.files\//gi, '/.files/');
    text = text.replace(/\/\s+files\//gi, '/.files/');
    text = unwrapWikiDirectivesFromHtml(text);
    text = text.replace(/([\p{L}\d][\p{L}\d\s«»""'\-–—,.]{8,}?):\1/gu, '$1');
    text = text.replace(/\(##`([^`]+)`##\*\*\)/gi, ' [$1]($1) ');
    text = text.replace(/\(##([^#]+?)##\*\*\)/gi, ' [$1]($1) ');
    text = text.replace(/#{5,}\s*\*\*([^*]+?)\*\*/g, '##### $1');
    text = text.replace(/#{3,}\s*\*\*([^*]+?)\*\*/g, '### $1');
    text = text.replace(/\.\.+(\*\*)+/g, '');
    text = text.replace(/#{5,}\s*!\s*$/gm, '');
    text = text.replace(/^\s*!\s*$/gm, '');
    text = text.replace(/<p>\s*!\s*<\/p>/gi, '');

    text = text
        .split('\n')
        .map((line) => {
            const legacyNumberedHeading = line.match(/^(\s*)#(\d+\.\s*[^#\n]+?)#(\s*)$/);
            if (legacyNumberedHeading) {
                return `${legacyNumberedHeading[1]}## ${legacyNumberedHeading[2].trim()}${legacyNumberedHeading[3]}`;
            }

            const legacyHeading = line.match(/^(\s*)#([^#\n]+?)#(\s*)$/);
            if (legacyHeading) {
                return `${legacyHeading[1]}# ${legacyHeading[2].trim()}${legacyHeading[3]}`;
            }

            const legacySubheading = line.match(/^(\s*)##([^#\n]+?)##(\s*)$/);
            if (legacySubheading) {
                return `${legacySubheading[1]}## ${legacySubheading[2].trim()}${legacySubheading[3]}`;
            }

            return line;
        })
        .join('\n');

    return text;
}

function markdownToHtmlFallback(content) {
    const source = String(content || '').replace(/\r\n/g, '\n').trim();
    if (!source) {
        return '<p>Страница пуста.</p>';
    }

    const blocks = source.split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);
    return blocks
        .map((block) => {
            if (/^<img\b/i.test(block)) {
                return block;
            }
            if (/^<(?:span|kbd|mark|del|code|strong|em)\b/i.test(block)) {
                return `<p>${block}</p>`;
            }
            if (/^!\[[^\]]*]\([^)]+\)$/.test(block)) {
                const imageMatch = block.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
                if (imageMatch) {
                    const alt = escapeHtml(imageMatch[1] || 'Изображение');
                    const src = escapeHtml(imageMatch[2]);
                    return `<p><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></p>`;
                }
            }
            if (block.startsWith('>')) {
                return `<blockquote>${applyInlineMarkdown(block.replace(/^>\s?/, ''))}</blockquote>`;
            }
            if (block.startsWith('### ')) {
                return `<h3>${applyInlineMarkdown(block.slice(4))}</h3>`;
            }
            if (block.startsWith('## ')) {
                return `<h2>${applyInlineMarkdown(block.slice(3))}</h2>`;
            }
            if (block.startsWith('# ')) {
                return `<h1>${applyInlineMarkdown(block.slice(2))}</h1>`;
            }
            if (/^\d+\.\s/.test(block)) {
                const items = block
                    .split(/\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => `<li>${applyInlineMarkdown(line.replace(/^\d+\.\s*/, ''))}</li>`)
                    .join('');
                return `<ol>${items}</ol>`;
            }
            if (/^[-*+]\s/.test(block)) {
                const items = block
                    .split(/\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => `<li>${applyInlineMarkdown(line.replace(/^[-*+]\s*/, ''))}</li>`)
                    .join('');
                return `<ul>${items}</ul>`;
            }
            return `<p>${applyInlineMarkdown(block).replace(/\n/g, '<br>')}</p>`;
        })
        .join('\n');
}

let transformFn = null;
let transformChecked = false;

async function resolveTransform() {
    if (transformChecked) {
        return transformFn;
    }

    transformChecked = true;
    try {
        const mod = await import('@diplodoc/transform');
        if (typeof mod.default === 'function') {
            transformFn = mod.default;
        } else if (typeof mod.transform === 'function') {
            transformFn = mod.transform;
        }
    } catch {
        transformFn = null;
    }
    return transformFn;
}

/**
 * @param {string} content
 * @param {(input: string, options: object) => { result?: { html?: string } }} transform
 * @returns {Promise<string>}
 */
async function runWikiTransformSafely(content, transform) {
    const input = String(content || '');
    if (input.length > config.yandexWikiTransformMaxInputChars) {
        throw createWikiError(413, 'Содержимое Wiki слишком большое для обработки.');
    }

    const timeoutMs = config.yandexWikiTransformTimeoutMs;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Wiki transform timeout'));
        }, timeoutMs);
    });

    try {
        const transformed = await Promise.race([
            Promise.resolve().then(() => transform(input, {
                extractTitle: false,
                needTitle: false
            })),
            timeoutPromise
        ]);
        return String(transformed?.result?.html || '').trim();
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

function looksLikeMarkdownContent(value) {
    const source = String(value || '');
    return /^#{1,6}\s/m.test(source)
        || /^#{1,6}[^#\n]+#/m.test(source)
        || /\*\*[^*\n]+\*\*/.test(source)
        || /^\s*[-*+]\s/m.test(source)
        || /!\[[^\]]*]\([^)]+\)/.test(source)
        || /\(\s*\/?[^)\s"]+\/\.files\//i.test(source)
        || /{%\s*(note|cut|toc)/i.test(source);
}

function shouldPreferYfmTransform(raw) {
    return looksLikeMarkdownContent(raw) || hasWikiYfmDirectives(raw);
}

function shouldUseHtmlSanitizeOnly(raw) {
    return isWikiWysiwygHtml(raw) && !shouldPreferYfmTransform(raw);
}

function looksLikeHtmlContent(value) {
    const source = String(value || '').trim();
    if (!source) {
        return false;
    }
    if (looksLikeMarkdownContent(source)) {
        return false;
    }
    return /^<[a-z!/]/i.test(source)
        || /<(?:p|div|h[1-6]|ul|ol|table|span|figure|section|article|blockquote)\b/i.test(source);
}

function stripHtmlToText(value) {
    return String(value || '')
        .replace(/<span[^>]*\byfm-line-number\b[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

function stripAutoListPrefix(text) {
    return String(text || '')
        .replace(/^\d+(?=[\p{L}])/u, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();
}

function removeYfmLineNumbersFromHtml(html) {
    return String(html || '')
        .replace(/<span[^>]*\byfm-line-number\b[^>]*>[\s\S]*?<\/span>\s*/gi, '');
}

function looksLikeConsoleLine(text) {
    return /(\.{2,}|\\|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|DNS|адаптер|adapter|IPv4|IPv6|маска|subnet|gateway|физический|physical)/i.test(text)
        || (/^[a-z0-9_-]{1,24}$/i.test(text) && !/\s/.test(text));
}

function consolidateTerminalLikeLists(html) {
    return String(html || '').replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, inner) => {
        const htmlItems = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
            .map((item) => removeYfmLineNumbersFromHtml(item[1]).trim());
        const items = htmlItems
            .map((item) => stripAutoListPrefix(stripHtmlToText(item)))
            .filter(Boolean);
        if (!items.length) {
            return match;
        }
        if (items.length === 2 && items[1].length <= 32 && /^[a-z0-9][a-z0-9 _\-/]{0,31}$/i.test(items[1])) {
            const firstHtml = htmlItems[0] || escapeHtml(items[0]);
            return `<p>${firstHtml}</p><pre class="wiki-console">${escapeHtml(items[1])}</pre>`;
        }
        if (items.length === 1 && /^[a-z][a-z0-9_-]{0,20}$/i.test(items[0])) {
            return `<pre class="wiki-console">${escapeHtml(items[0])}</pre>`;
        }
        if (items.length < 4) {
            return match;
        }
        const consoleLikeCount = items.filter((line) => looksLikeConsoleLine(line)).length;
        if (consoleLikeCount / items.length < 0.35) {
            return match;
        }
        return `<pre class="wiki-console">${escapeHtml(items.join('\n'))}</pre>`;
    });
}

function convertWikiKeyboardMarkup(html) {
    const replaceInlineCode = (chunk) => chunk
        .replace(/<code\b[^>]*>([^<]+)<\/code>/gi, (_, keys) => `<kbd class="wiki-kbd">${keys.trim()}</kbd>`)
        .replace(/<kbd class="wiki-kbd">([^<]+)<\/kbd>/gi, (_, keys) => `<kbd class="wiki-kbd">${keys.trim()}</kbd>`);

    return String(html || '')
        .replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => `<p${attrs}>${replaceInlineCode(inner)}</p>`)
        .replace(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi, (match, attrs, inner) => `<li${attrs}>${replaceInlineCode(inner)}</li>`)
        .replace(/\+\+(.+?)\+\+/g, (_, keys) => `<kbd class="wiki-kbd">${escapeHtml(keys.trim())}</kbd>`);
}

function postProcessWikiHtml(html) {
    let result = String(html || '');

    result = result.replace(
        /(<(?:strong|b)>)([^<]+)(<\/(?:strong|b)>)\s*\1\2\3/gi,
        '$1$2$3'
    );

    result = result.replace(
        /(<p[^>]*>)([^<:]{3,}?):\s*\2(<\/p>)/gi,
        '$1$2$3'
    );

    result = result.replace(/([^<>]{8,}?):\1/g, '$1');
    result = result.replace(/^\s*!\s*$/gm, '');
    result = result.replace(/<p>\s*!\s*<\/p>/gi, '');
    result = result.replace(/<\/ol>\s*<ol[^>]*>/gi, '');
    result = safeUnescapeWikiTags(result);
    result = result.replace(/<a\b[^>]*\byfm-anchor[^>]*>[\s\S]*?<\/a>\s*/gi, '');
    result = removeYfmLineNumbersFromHtml(result);
    result = convertLegacyWikiColors(result);
    result = convertWikiKeyboardMarkup(result);
    result = consolidateTerminalLikeLists(result);
    result = convertLegacyWikiImages(result);
    result = linkifyPlainUrls(result);

    return sanitizeAndRewriteHtml(result);
}

function isWikiWysiwygHtml(value) {
    const source = String(value || '');
    return /<(?:div|span|p|table|section|article|figure|ul|ol|li)\b/i.test(source);
}

async function renderWikiContent(content, context = {}) {
    const raw = String(content || '').trim();
    if (!raw) {
        return '<p>Страница пуста.</p>';
    }

    const preprocessed = preprocessLegacyWikiMarkup(raw);
    const withTreeMacros = resolveWikiTreeMacros(preprocessed, context);
    let html = '';

    if (shouldUseHtmlSanitizeOnly(raw)) {
        html = sanitizeAndRewriteHtml(withTreeMacros);
    } else if (shouldPreferYfmTransform(raw)) {
        const transform = await resolveTransform();
        if (transform) {
            try {
                html = await runWikiTransformSafely(withTreeMacros, transform);
            } catch (error) {
                console.warn('YFM transform failed, using fallback renderer:', error instanceof Error ? error.message : error);
            }
        }
        if (!html) {
            html = markdownToHtmlFallback(withTreeMacros);
        } else {
            html = sanitizeAndRewriteHtml(html);
        }
    } else if (looksLikeHtmlContent(withTreeMacros) || isWikiWysiwygHtml(withTreeMacros)) {
        html = sanitizeAndRewriteHtml(withTreeMacros);
    } else {
        html = markdownToHtmlFallback(withTreeMacros);
    }

    html = postProcessWikiHtml(html);
    html = convertLegacyWikiImages(html);
    html = resolveWikiImagesInHtml(html, context);
    html = postProcessWikiHtml(html);
    html = resolveWikiTreeMacros(html, context);
    html = convertLegacyWikiColors(html);
    html = stripUnresolvedWikiMacros(html);
    return sanitizeAndRewriteHtml(html);
}

async function renderWikiContentForTest(content, context = {}) {
    return renderWikiContent(content, context);
}

export {
    preprocessLegacyWikiMarkup,
    renderWikiContent,
    renderWikiContentForTest,
    runWikiTransformSafely,
    postProcessWikiHtml,
    markdownToHtmlFallback
};
