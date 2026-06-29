import { normalizeWikiSlug } from './wikiScope.js';

function splitSlug(value) {
    return normalizeWikiSlug(value)
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
}

function slugDepth(slug) {
    return splitSlug(slug).length;
}

function slugToLabel(slug) {
    const parts = splitSlug(slug);
    const tail = parts[parts.length - 1] || '';
    return tail
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Страница';
}

function pickPageTitle(rawPage, slug) {
    const candidates = [
        rawPage?.title,
        rawPage?.name,
        rawPage?.page_title,
        rawPage?.attributes?.title,
        rawPage?.display_name
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    if (!candidates.length) {
        return slugToLabel(slug);
    }

    const preferred = candidates.find((value) => !isLikelyFallbackTitle(value, slug));
    if (preferred) {
        return preferred;
    }

    const withCyrillic = candidates.find((value) => /[а-яё]/i.test(value));
    if (withCyrillic) {
        return withCyrillic;
    }

    return candidates[0];
}

function cleanWikiInlineText(value) {
    return String(value || '')
        .replace(/\{%[\s\S]*?%\}/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function isUsefulExtractedTitle(value) {
    const text = cleanWikiInlineText(value);
    if (text.length < 3 || text.length > 160) {
        return false;
    }
    return /[а-яё]/i.test(text);
}

function parentSlugOf(slug) {
    const parts = splitSlug(slug);
    if (parts.length <= 1) {
        return '';
    }
    return parts.slice(0, -1).join('/');
}

function isLikelyFallbackTitle(title, slug) {
    const normalizedTitle = String(title || '').trim().toLowerCase();
    if (!normalizedTitle) {
        return true;
    }
    const fallback = slugToLabel(slug).toLowerCase();
    const slugTail = splitSlug(slug).pop()?.replace(/[-_]+/g, ' ').toLowerCase() || '';
    if (normalizedTitle === fallback || normalizedTitle === slugTail) {
        return true;
    }

    const slugTailCompact = slugTail.replace(/\s+/g, '');
    const titleCompact = normalizedTitle.replace(/\s+/g, '');
    if (slugTailCompact && titleCompact) {
        if (titleCompact === slugTailCompact
            || slugTailCompact.startsWith(titleCompact)
            || titleCompact.startsWith(slugTailCompact)) {
            return true;
        }
    }

    // Latin transliteration instead of a Russian page title.
    if (!/[а-яё]/i.test(normalizedTitle) && /[a-z]/i.test(normalizedTitle)) {
        const slugWords = slugTail.split(/\s+/).filter((word) => word.length > 1);
        const titleWords = normalizedTitle.split(/\s+/).filter((word) => word.length > 1);
        if (slugWords.length >= 2 && titleWords.length >= 2) {
            const matched = titleWords.filter((word) => slugWords.includes(word)).length;
            const threshold = Math.ceil(Math.min(slugWords.length, titleWords.length) * 0.6);
            if (matched >= threshold) {
                return true;
            }
        }
        if ((slugTail.includes(' ') || slugTail.includes('-'))
            && normalizedTitle === normalizedTitle.toLowerCase()) {
            return true;
        }
    }
    return false;
}

function extractTitleFromWikiContent(content) {
    const raw = String(content || '').trim();
    if (!raw) {
        return '';
    }

    const headingPatterns = [
        /^#{1,6}\s+(.+?)\s*$/gm,
        /^(.+?)\s*\n={3,}\s*$/gm
    ];
    for (const pattern of headingPatterns) {
        let match;
        while ((match = pattern.exec(raw)) !== null) {
            const heading = cleanWikiInlineText(match[1]);
            if (isUsefulExtractedTitle(heading)) {
                return heading;
            }
        }
    }

    const htmlHeadingMatches = raw.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi);
    for (const match of htmlHeadingMatches) {
        const heading = cleanWikiInlineText(match[1]);
        if (isUsefulExtractedTitle(heading)) {
            return heading;
        }
    }

    const boldMatch = raw.match(/^\s*(?:\*\*|__)([^*\n_]{3,160})(?:\*\*|__)/m);
    if (boldMatch) {
        const bold = cleanWikiInlineText(boldMatch[1]);
        if (isUsefulExtractedTitle(bold)) {
            return bold;
        }
    }

    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines.slice(0, 40)) {
        if (/^\{%/.test(line) || /^\{\{/.test(line) || /^!\[/.test(line)) {
            continue;
        }
        const plain = cleanWikiInlineText(line.replace(/^#+\s+/, ''));
        if (isUsefulExtractedTitle(plain)) {
            return plain;
        }
    }

    return '';
}

function resolveWikiPageTitle(page, content = '') {
    const slug = normalizeWikiSlug(page?.slug);
    const rawSource = page?.original && typeof page.original === 'object' ? page.original : page;
    let title = pickPageTitle(rawSource, slug);
    if (title && !isLikelyFallbackTitle(title, slug)) {
        return title;
    }
    const extracted = extractTitleFromWikiContent(content || page?.content || '');
    if (extracted && !isLikelyFallbackTitle(extracted, slug)) {
        return extracted;
    }
    return title || slugToLabel(slug);
}

export {
    splitSlug,
    slugToLabel,
    slugDepth,
    parentSlugOf,
    pickPageTitle,
    resolveWikiPageTitle,
    isLikelyFallbackTitle,
    extractTitleFromWikiContent
};
