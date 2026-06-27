// Controlled search: literal substring match first, synonyms only for whole words.
(() => {
    const searchIndex = window.PortalSearchIndex || {};
    const cards = searchIndex.cards || {};
    const sections = searchIndex.sections || {};
    const rawAliases = searchIndex.globalSynonyms || {};
    const MIN_QUERY_LEN = 3;
    const MIN_ALIAS_TERM_LEN = 3;
    const STOP_TOKENS = new Set([
        'и', 'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'для', 'или', 'а', 'но', 'из', 'у', 'о', 'от'
    ]);

    const EN_TO_RU = {
        q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
        '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л',
        l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
        ',': 'б', '.': 'ю', '`': 'ё'
    };

    const RU_TO_EN = Object.fromEntries(Object.entries(EN_TO_RU).map(([en, ru]) => [ru, en]));

    function normalize(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenize(value) {
        return normalize(value).match(/[a-zа-я0-9]+/g) || [];
    }

    function switchLayout(value, map) {
        return String(value || '')
            .split('')
            .map((char) => map[char] || char)
            .join('');
    }

    function layoutVariants(value) {
        const normalized = normalize(value);
        if (!normalized) return [];
        const variants = new Set([normalized]);
        const ruVariant = normalize(switchLayout(normalized, EN_TO_RU));
        const enVariant = normalize(switchLayout(normalized, RU_TO_EN));
        if (ruVariant) variants.add(ruVariant);
        if (enVariant) variants.add(enVariant);
        return Array.from(variants);
    }

    function buildAliasMap(aliases) {
        const aliasMap = new Map();

        Object.entries(aliases).forEach(([key, values]) => {
            const group = new Set();
            const keyNormalized = normalize(key);
            if (keyNormalized) group.add(keyNormalized);
            (Array.isArray(values) ? values : []).forEach((value) => {
                const valueNormalized = normalize(value);
                if (valueNormalized) group.add(valueNormalized);
            });

            group.forEach((term) => {
                if (!aliasMap.has(term)) aliasMap.set(term, new Set());
                group.forEach((alias) => aliasMap.get(term).add(alias));
            });
        });

        return aliasMap;
    }

    function buildSearchText(entry) {
        const parts = [
            entry.title || '',
            entry.desc || '',
            ...(Array.isArray(entry.keywords) ? entry.keywords : [])
        ];
        return normalize(parts.join(' '));
    }

    function buildEntryLookup(entries) {
        const lookup = {};
        Object.values(entries).forEach((entry) => {
            lookup[entry.id] = {
                searchText: buildSearchText(entry)
            };
        });
        return lookup;
    }

    const aliasMap = buildAliasMap(rawAliases);
    const cardLookup = buildEntryLookup(cards);
    const sectionLookup = buildEntryLookup(sections);

    function expandAliases(term) {
        const normalizedTerm = normalize(term);
        const expanded = new Set();
        if (!normalizedTerm) return expanded;

        layoutVariants(normalizedTerm).forEach((variant) => {
            expanded.add(variant);
            const aliases = aliasMap.get(variant);
            if (aliases) {
                aliases.forEach((alias) => expanded.add(alias));
            }
        });

        return expanded;
    }

    function includesFragment(searchText, fragment) {
        const normalizedFragment = normalize(fragment);
        if (!normalizedFragment || normalizedFragment.length < MIN_QUERY_LEN) return false;
        return layoutVariants(normalizedFragment).some(
            (variant) => variant.length >= MIN_QUERY_LEN && searchText.includes(variant)
        );
    }

    function buildQueryState(query) {
        const normalizedQuery = normalize(query);
        const rawTokens = tokenize(normalizedQuery);
        const meaningfulTokens = rawTokens.filter((token) => !STOP_TOKENS.has(token));

        if (!normalizedQuery || normalizedQuery.length < MIN_QUERY_LEN) {
            return {
                hasQuery: false,
                normalizedQuery,
                rawTokens,
                meaningfulTokens
            };
        }

        return {
            hasQuery: true,
            normalizedQuery,
            rawTokens,
            meaningfulTokens: meaningfulTokens.length ? meaningfulTokens : rawTokens
        };
    }

    function entryMatches(entry, queryState) {
        if (!entry || !queryState.hasQuery) return true;

        const { searchText } = entry;
        if (!searchText) return false;

        if (includesFragment(searchText, queryState.normalizedQuery)) {
            return true;
        }

        if (queryState.meaningfulTokens.length > 1) {
            return queryState.meaningfulTokens.every((token) => includesFragment(searchText, token));
        }

        const [singleToken] = queryState.meaningfulTokens;
        if (!singleToken) return false;

        if (includesFragment(searchText, singleToken)) {
            return true;
        }

        for (const aliasTerm of expandAliases(singleToken)) {
            if (aliasTerm === singleToken) continue;
            if (aliasTerm.length < MIN_ALIAS_TERM_LEN) continue;
            if (!searchText.includes(aliasTerm)) continue;
            if (aliasMatchesToken(singleToken, aliasTerm)) {
                return true;
            }
        }

        return false;
    }

    function aliasMatchesToken(token, aliasTerm) {
        if (aliasTerm.includes(' ')) {
            return aliasTerm.includes(token);
        }

        const sharedPrefixLen = Math.min(4, token.length, aliasTerm.length);
        if (sharedPrefixLen >= 3 && token.slice(0, sharedPrefixLen) === aliasTerm.slice(0, sharedPrefixLen)) {
            return true;
        }

        if (token.length <= 4 && aliasTerm.length <= 4) {
            return true;
        }

        return token.includes(aliasTerm) || aliasTerm.includes(token);
    }

    function cardIdFromElement(cardElement) {
        return cardElement?.dataset?.requestType || cardElement?.dataset?.useful || cardElement?.dataset?.action || '';
    }

    function collectMatchedSectionIds(queryState) {
        const matchedSectionIds = new Set();
        Object.keys(sectionLookup).forEach((sectionId) => {
            if (entryMatches(sectionLookup[sectionId], queryState)) {
                matchedSectionIds.add(sectionId);
            }
        });
        return matchedSectionIds;
    }

    function createMatcher(query) {
        const queryState = buildQueryState(query);
        if (!queryState.hasQuery) {
            return {
                hasQuery: false,
                query: queryState.normalizedQuery,
                matchedSectionIds: new Set(),
                matchesCard: () => true
            };
        }

        const matchedSectionIds = collectMatchedSectionIds(queryState);

        return {
            hasQuery: true,
            query: queryState.normalizedQuery,
            matchedSectionIds,
            matchesCard(cardElement) {
                const cardId = cardIdFromElement(cardElement);
                const cardEntry = cardLookup[cardId];
                if (cardEntry) return entryMatches(cardEntry, queryState);

                const meta = cards[cardId];
                const fallbackText = buildSearchText({
                    title: cardElement?.querySelector('.card-title')?.textContent || meta?.title || '',
                    desc: cardElement?.querySelector('.card-desc')?.textContent || meta?.desc || '',
                    keywords: []
                });
                return entryMatches({ searchText: fallbackText }, queryState);
            }
        };
    }

    let cachedQuery = '';
    let cachedMatcher = createMatcher('');

    function getMatcher(query) {
        const normalizedQuery = normalize(query);
        if (normalizedQuery !== cachedQuery) {
            cachedQuery = normalizedQuery;
            cachedMatcher = createMatcher(normalizedQuery);
        }
        return cachedMatcher;
    }

    window.PortalSearch = {
        createMatcher,
        getMatchedSectionIds(query) {
            return new Set(getMatcher(query).matchedSectionIds);
        }
    };
})();
