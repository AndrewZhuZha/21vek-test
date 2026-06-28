import {
    fetchWikiAssetBuffer,
    fetchWikiPageBySlug,
    getWikiPagePayload,
    getWikiTreePayload,
    normalizeWikiSlug
} from './yandexWiki.js';

export const WIKI_AUDIT_CHECKS = [
    { id: 'raw_tree_macro', re: /(?:\{%|\{\{)\s*-?\s*tree\b/i, label: 'сырой макрос {% tree %}' },
    { id: 'raw_note_cut', re: /(?:\{%|\{\{)\s*-?\s*(?:note|cut)\b/i, label: 'сырой note/cut' },
    { id: 'raw_color', re: /\{[a-zA-Zа-яА-ЯёЁ]+\}\([^)]+\)/, label: 'сырой цвет {color}(...)' },
    { id: 'raw_bang_color', re: /!!(?:\([^)]+\)|[a-zA-Zа-яА-ЯёЁ]+)/, label: 'сырой цвет !!...!!' },
    { id: 'raw_keyboard', re: /\+\+[^+\n]+?\+\+/, label: 'сырая клавиатура ++...++' },
    { id: 'escaped_kbd', re: /&lt;kbd\b/i, label: 'экранированный <kbd> (виден как текст)' },
    { id: 'escaped_html', re: /&lt;span[^&]*wiki-color/i, label: 'экранированный span.wiki-color' },
    { id: 'yfm_line_number', re: /\byfm-line-number\b/i, label: 'неразобранный yfm-line-number' },
    { id: 'legacy_image', re: /\(\s*\/?[^)\s"]+\/\.files\//i, label: 'legacy синтаксис картинки (.files/)' },
    { id: 'yfm_anchor', re: /\byfm-anchor\b/i, label: 'дублирующий yfm-anchor' },
    { id: 'orphan_exclamation', re: /<p>\s*!\s*<\/p>/i, label: 'артефакт «!»' },
    { id: 'no_asset_proxy', re: /<img\b/i, negate: /\/api\/wiki\/asset/i, label: 'img без прокси /api/wiki/asset' }
];

/**
 * @param {string} html
 * @returns {string[]}
 */
export function detectWikiHtmlIssues(html) {
    const source = String(html || '');
    const found = [];
    for (const check of WIKI_AUDIT_CHECKS) {
        if (check.negate) {
            if (check.re.test(source) && !check.negate.test(source)) {
                found.push(check.label);
            }
            continue;
        }
        if (check.re.test(source)) {
            found.push(check.label);
        }
    }
    return found;
}

/**
 * @param {string} html
 * @param {number} [radius=120]
 * @returns {string}
 */
export function extractWikiHtmlIssueSnippet(html, radius = 120) {
    const source = String(html || '');
    for (const check of WIKI_AUDIT_CHECKS) {
        check.re.lastIndex = 0;
        if (check.negate) {
            check.negate.lastIndex = 0;
            if (!check.re.test(source) || check.negate.test(source)) {
                continue;
            }
            check.re.lastIndex = 0;
        }
        const match = check.re.exec(source);
        if (match) {
            const index = match.index ?? 0;
            const start = Math.max(0, index - radius);
            const end = Math.min(source.length, index + radius);
            return source.slice(start, end).replace(/\s+/g, ' ').trim();
        }
    }
    return '';
}

/**
 * @param {string} html
 * @param {string | undefined} accessToken
 * @returns {Promise<string[]>}
 */
async function probeWikiAssetIssues(html, accessToken) {
    if (!accessToken) {
        return [];
    }
    const source = String(html || '');
    const assetMatch = source.match(/\/api\/wiki\/asset[^"']+/);
    if (!assetMatch) {
        return [];
    }
    try {
        const url = new URL(assetMatch[0], 'http://local');
        const pageId = Number(url.searchParams.get('pageId'));
        const file = url.searchParams.get('file') || '';
        const sourceSlug = url.searchParams.get('slug') || '';
        const attachmentId = Number(url.searchParams.get('attachmentId'));
        const asset = await fetchWikiAssetBuffer(
            pageId,
            file,
            accessToken,
            '',
            sourceSlug,
            Number.isFinite(attachmentId) ? attachmentId : 0
        );
        if (!asset?.buffer?.length) {
            return ['asset пустой (0 bytes)'];
        }
        return [];
    } catch (error) {
        return [`asset недоступен: ${error instanceof Error ? error.message : String(error)}`];
    }
}

/**
 * @param {string} slug
 * @param {string | undefined} accessToken
 * @param {{ probeAssets?: boolean }} [options]
 */
export async function auditWikiPage(slug, accessToken, options = {}) {
    const normalizedSlug = normalizeWikiSlug(slug);
    const page = await getWikiPagePayload(normalizedSlug, accessToken);
    let rawContent = '';
    try {
        const rawPage = await fetchWikiPageBySlug(normalizedSlug, true, accessToken);
        rawContent = String(rawPage?.content || '');
    } catch {
        rawContent = '';
    }

    const issues = detectWikiHtmlIssues(page.html);
    if (options.probeAssets !== false && accessToken) {
        const assetIssues = await probeWikiAssetIssues(page.html, accessToken);
        issues.push(...assetIssues);
    }

    if (!issues.length) {
        return null;
    }

    return {
        slug: page.slug,
        title: page.title,
        issues,
        rawSnippet: rawContent.slice(0, 300),
        htmlSnippet: extractWikiHtmlIssueSnippet(page.html) || String(page.html || '').slice(0, 300)
    };
}

/**
 * @param {string | undefined} accessToken
 * @param {{ limit?: number, probeAssets?: boolean }} [options]
 */
export async function runWikiAudit(accessToken, options = {}) {
    const limit = Math.max(0, Number(options.limit) || 0);
    const tree = await getWikiTreePayload(accessToken);
    const items = Array.isArray(tree?.items) ? tree.items : [];
    const slice = limit > 0 ? items.slice(0, limit) : items;
    const report = [];
    let issueCount = 0;

    for (const item of slice) {
        try {
            const entry = await auditWikiPage(item.slug, accessToken, {
                probeAssets: options.probeAssets
            });
            if (entry) {
                issueCount += entry.issues.length;
                report.push(entry);
            }
        } catch (error) {
            issueCount += 1;
            report.push({
                slug: normalizeWikiSlug(item.slug),
                title: item.title,
                issues: [`ошибка загрузки: ${error instanceof Error ? error.message : String(error)}`],
                rawSnippet: '',
                htmlSnippet: ''
            });
        }
    }

    return {
        scanned: slice.length,
        total: items.length,
        issueCount,
        report
    };
}
