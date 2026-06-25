import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const INDEX_HTML_PATH = path.join(rootDir, 'index.html');
const APP_JS_PATH = path.join(rootDir, 'js', 'app.js');
const CONFIG_JS_PATH = path.join(rootDir, 'js', 'config.js');
const OVERRIDES_PATH = path.join(rootDir, 'data', 'search.overrides.json');
const OUTPUT_PATH = path.join(rootDir, 'js', 'search-index.js');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
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

function parseRequestMap(appSource) {
    const requestMap = {};
    const mapMatch = appSource.match(/const requestMap = \{([\s\S]*?)\n\s*\};/);
    if (!mapMatch) {
        throw new Error('Не удалось найти requestMap в js/app.js');
    }

    const entryPattern = /([a-z0-9_]+)\s*:\s*\{\s*title:\s*'([^']*)',\s*options:\s*\[([\s\S]*?)\],\s*defaultOpt:\s*'[^']*'\s*\}/g;
    let match = entryPattern.exec(mapMatch[1]);
    while (match) {
        const [, id, title, optionsRaw] = match;
        const options = [];
        const optionPattern = /'([^']*)'/g;
        let optionMatch = optionPattern.exec(optionsRaw);
        while (optionMatch) {
            options.push(optionMatch[1]);
            optionMatch = optionPattern.exec(optionsRaw);
        }
        requestMap[id] = { title, options };
        match = entryPattern.exec(mapMatch[1]);
    }

    return requestMap;
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

        const cardPattern = /<div class="service-card([^>]*)>[\s\S]*?<div class="card-title">([\s\S]*?)<\/div>[\s\S]*?<div class="card-desc">([\s\S]*?)<\/div>/g;
        let cardMatch = cardPattern.exec(sectionHtml);

        while (cardMatch) {
            const attrs = parseAttributes(cardMatch[1]);
            const requestType = attrs['data-request-type'] || '';
            const usefulKey = attrs['data-useful'] || '';
            const cardId = requestType || usefulKey;
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

async function build() {
    const [indexSource, appSource, configSource, overridesRaw] = await Promise.all([
        readFile(INDEX_HTML_PATH, 'utf8'),
        readFile(APP_JS_PATH, 'utf8'),
        readFile(CONFIG_JS_PATH, 'utf8'),
        readFile(OVERRIDES_PATH, 'utf8')
    ]);

    const overrides = JSON.parse(overridesRaw);
    const configSections = parseConfigSections(configSource);
    const requestMap = parseRequestMap(appSource);
    const parsedIndex = parseIndexCards(indexSource);

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
            : (overrides.useful?.[card.usefulKey]?.keywords || []);

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
            kind: card.requestType ? 'request' : 'useful',
            requestType: card.requestType,
            usefulKey: card.usefulKey,
            title: card.title,
            desc: card.desc,
            keywords: cardKeywords,
            corpus: cardKeywords.join(' ')
        };
    });

    const searchIndex = {
        version: 1,
        generatedAt: new Date().toISOString(),
        globalSynonyms: normalizeSynonyms(overrides.globalSynonyms),
        sections,
        cards,
        stats: {
            sections: Object.keys(sections).length,
            cards: Object.keys(cards).length
        }
    };

    const output = `/**\n * AUTO-GENERATED FILE.\n * Source: scripts/build-search-index.mjs\n * Do not edit manually.\n */\nwindow.PortalSearchIndex = ${JSON.stringify(searchIndex, null, 4)};\n`;
    await writeFile(OUTPUT_PATH, output, 'utf8');

    console.log(`Search index generated: ${path.relative(rootDir, OUTPUT_PATH)}`);
    console.log(`Sections: ${searchIndex.stats.sections}; cards: ${searchIndex.stats.cards}`);
}

build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
