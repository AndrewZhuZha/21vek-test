import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const INDEX_HTML_PATH = path.join(rootDir, 'index.html');
const CONFIG_JS_PATH = path.join(rootDir, 'js', 'config.js');
const OVERRIDES_PATH = path.join(rootDir, 'data', 'search.overrides.json');
const REQUEST_TYPES_PATH = path.join(rootDir, 'data', 'request-types.json');
const WIKI_SEARCH_PATH = path.join(rootDir, 'data', 'wiki-search.json');
const OUTPUT_PATH = path.join(rootDir, 'js', 'search-index.js');
const REQUEST_TYPES_OUTPUT_PATH = path.join(rootDir, 'js', 'request-types.js');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

async function writeFileAtomic(targetPath, content) {
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
}

function uniqNormalized(values) {
    const unique = new Set();
    values.forEach((value) => {
        const normalized = normalizeText(value);
        if (normalized) unique.add(normalized);
    });
    return Array.from(unique);
}

function parseAttributes(rawAttrs) {
    const attrs = {};
    const attrPattern = /([a-zA-Z0-9:-]+)="([^"]*)"/g;
    let match = attrPattern.exec(rawAttrs);
    while (match) {
        attrs[match[1]] = match[2];
        match = attrPattern.exec(rawAttrs);
    }
    return attrs;
}

function parseConfigSections(configSource) {
    const sections = {};
    const pattern = /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*icon:\s*'([^']+)'\s*\}/g;
    let match = pattern.exec(configSource);
    while (match) {
        const [, id, label, icon] = match;
        sections[id] = { id, label, icon };
        match = pattern.exec(configSource);
    }
    return sections;
}

function validateRequestTypesSync(cards, requestMap) {
    const htmlRequestTypes = new Set(
        cards.filter((card) => card.requestType).map((card) => card.requestType)
    );
    const jsonRequestTypes = new Set(Object.keys(requestMap));

    htmlRequestTypes.forEach((requestType) => {
        if (!jsonRequestTypes.has(requestType)) {
            throw new Error(`Карточка HTML data-request-type="${requestType}" отсутствует в data/request-types.json`);
        }
    });

    jsonRequestTypes.forEach((requestType) => {
        if (!htmlRequestTypes.has(requestType)) {
            throw new Error(`Тип "${requestType}" из data/request-types.json не найден среди карточек HTML`);
        }
    });
}

function parseIndexCards(indexSource) {
    const sections = {};
    const cards = [];
    const sectionPattern = /<section class="section-group" id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
    let sectionMatch = sectionPattern.exec(indexSource);

    while (sectionMatch) {
        const sectionId = sectionMatch[1];
        const sectionHtml = sectionMatch[2];
        const titleMatch = sectionHtml.match(/<div class="group-title">[\s\S]*?<span>[^<]*<\/span>\s*<span>([^<]+)<\/span>/);
        const sectionTitle = titleMatch ? titleMatch[1].trim() : sectionId;
        sections[sectionId] = sectionTitle;

        const cardPattern = /<(?:div|button)[^>]*class="service-card([^>]*)>[\s\S]*?<div class="card-title">([\s\S]*?)<\/div>[\s\S]*?<div class="card-desc">([\s\S]*?)<\/div>/g;
        let cardMatch = cardPattern.exec(sectionHtml);

        while (cardMatch) {
            const attrs = parseAttributes(cardMatch[1]);
            const requestType = attrs['data-request-type'] || '';
            const usefulKey = attrs['data-useful'] || '';
            const action = attrs['data-action'] || '';
            const cardId = requestType || usefulKey || action;
            if (cardId) {
                cards.push({
                    id: cardId,
                    sectionId,
                    requestType: requestType || null,
                    usefulKey: usefulKey || null,
                    dataTitle: attrs['data-title'] || '',
                    title: cardMatch[2].trim(),
                    desc: cardMatch[3].trim()
                });
            }

            cardMatch = cardPattern.exec(sectionHtml);
        }

        sectionMatch = sectionPattern.exec(indexSource);
    }

    return { sections, cards };
}

function normalizeSynonyms(globalSynonyms) {
    const result = {};
    Object.entries(globalSynonyms || {}).forEach(([key, list]) => {
        const normalizedKey = normalizeText(key);
        const normalizedValues = uniqNormalized(Array.isArray(list) ? list : []);
        if (!normalizedKey || !normalizedValues.length) return;
        result[normalizedKey] = normalizedValues;
    });
    return result;
}

function parseWikiSearchRaw(raw) {
    if (!raw || !String(raw).trim()) {
        return [];
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Некорректный JSON в data/wiki-search.json: ${error.message}`);
    }

    const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
            ? parsed.items
            : [];

    return items
        .map((item) => {
            const slug = String(item?.slug || '')
                .trim()
                .replace(/^\/+/, '')
                .replace(/\/+$/, '');
            if (!slug) return null;

            const title = String(item?.title || '')
                .trim()
                || slug.split('/').pop().replace(/[-_]+/g, ' ');
            const corpus = String(item?.corpus || '').trim();
            const keywords = uniqNormalized([
                title,
                slug.replace(/\//g, ' '),
                corpus
            ]);

            return {
                id: `wiki:${slug}`,
                slug,
                title,
                href: `/wiki/#/${slug.split('/').map((part) => encodeURIComponent(part)).join('/')}`,
                keywords,
                corpus: uniqNormalized([title, slug.replace(/\//g, ' '), corpus]).join(' '),
                updatedAt: String(item?.updatedAt || item?.updated_at || '').trim() || null
            };
        })
        .filter(Boolean);
}

async function build() {
    const [indexSource, configSource, overridesRaw, requestTypesRaw, wikiSearchRaw] = await Promise.all([
        readFile(INDEX_HTML_PATH, 'utf8'),
        readFile(CONFIG_JS_PATH, 'utf8'),
        readFile(OVERRIDES_PATH, 'utf8'),
        readFile(REQUEST_TYPES_PATH, 'utf8'),
        readFile(WIKI_SEARCH_PATH, 'utf8').catch(() => '')
    ]);

    const overrides = JSON.parse(overridesRaw);
    const requestMap = JSON.parse(requestTypesRaw);
    const wikiPagesArray = parseWikiSearchRaw(wikiSearchRaw);
    const wikiEnabled = String(process.env.YANDEX_WIKI_ENABLED || 'false').toLowerCase() === 'true';
    const minWikiPagesRaw = Number(process.env.YANDEX_WIKI_MIN_PAGES || process.env.WIKI_INDEX_MIN_COUNT || '1');
    const minWikiPages = Number.isFinite(minWikiPagesRaw) && minWikiPagesRaw > 0 ? Math.floor(minWikiPagesRaw) : 1;
    if (wikiEnabled && wikiPagesArray.length < minWikiPages) {
        throw new Error(`Wiki index validation failed: pages=${wikiPagesArray.length}, required>=${minWikiPages}`);
    }
    const configSections = parseConfigSections(configSource);
    const parsedIndex = parseIndexCards(indexSource);

    validateRequestTypesSync(parsedIndex.cards, requestMap);

    const sectionIds = new Set([
        ...Object.keys(configSections),
        ...Object.keys(parsedIndex.sections),
        ...Object.keys(overrides.sections || {})
    ]);

    const sections = {};
    sectionIds.forEach((sectionId) => {
        const configSection = configSections[sectionId] || {};
        const htmlSectionTitle = parsedIndex.sections[sectionId] || '';
        const overrideKeywords = overrides.sections?.[sectionId]?.keywords || [];

        const sectionKeywords = uniqNormalized([
            configSection.label || '',
            htmlSectionTitle,
            ...overrideKeywords
        ]);

        sections[sectionId] = {
            id: sectionId,
            label: configSection.label || htmlSectionTitle || sectionId,
            icon: configSection.icon || '',
            title: htmlSectionTitle || configSection.label || sectionId,
            keywords: sectionKeywords,
            corpus: sectionKeywords.join(' ')
        };
    });

    const cards = {};
    parsedIndex.cards.forEach((card) => {
        const requestInfo = card.requestType ? requestMap[card.requestType] : null;
        const overrideKeywords = card.requestType
            ? (overrides.cards?.[card.requestType]?.keywords || [])
            : card.usefulKey
                ? (overrides.useful?.[card.usefulKey]?.keywords || [])
                : (overrides.actions?.[card.id]?.keywords || []);

        const sectionOverrideKeywords = overrides.sections?.[card.sectionId]?.keywords || [];

        const cardKeywords = uniqNormalized([
            card.dataTitle,
            card.title,
            card.desc,
            requestInfo?.title || '',
            ...(requestInfo?.options || []),
            ...sectionOverrideKeywords,
            ...overrideKeywords
        ]);

        cards[card.id] = {
            id: card.id,
            sectionId: card.sectionId,
            kind: card.requestType ? 'request' : (card.usefulKey ? 'useful' : 'action'),
            requestType: card.requestType,
            usefulKey: card.usefulKey,
            title: card.title,
            desc: card.desc,
            keywords: cardKeywords,
            corpus: cardKeywords.join(' ')
        };
    });

    const wikiPages = {};
    wikiPagesArray.forEach((page) => {
        wikiPages[page.id] = page;
    });

    const searchIndex = {
        version: 3,
        generatedAt: new Date().toISOString(),
        globalSynonyms: normalizeSynonyms(overrides.globalSynonyms),
        sections,
        cards,
        wikiPages,
        stats: {
            sections: Object.keys(sections).length,
            cards: Object.keys(cards).length,
            wikiPages: Object.keys(wikiPages).length
        }
    };

    const output = `/**\n * AUTO-GENERATED FILE.\n * Source: scripts/build-search-index.mjs\n * Do not edit manually.\n */\nwindow.PortalSearchIndex = ${JSON.stringify(searchIndex, null, 4)};\n`;
    const requestTypesOutput = `/**\n * AUTO-GENERATED FILE.\n * Source: data/request-types.json via scripts/build-search-index.mjs\n * Do not edit manually.\n */\nwindow.PortalRequestTypes = ${JSON.stringify(requestMap, null, 4)};\n`;

    await Promise.all([
        writeFileAtomic(OUTPUT_PATH, output),
        writeFileAtomic(REQUEST_TYPES_OUTPUT_PATH, requestTypesOutput)
    ]);

    console.log(`Search index generated: ${path.relative(rootDir, OUTPUT_PATH)}`);
    console.log(`Request types generated: ${path.relative(rootDir, REQUEST_TYPES_OUTPUT_PATH)}`);
    console.log(`Sections: ${searchIndex.stats.sections}; cards: ${searchIndex.stats.cards}; wiki: ${searchIndex.stats.wikiPages}`);
}

build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
