// Controlled, deterministic search engine with explicit aliases.
(() => {
    const searchIndex = window.PortalSearchIndex || {};
    const cards = searchIndex.cards || {};
    const sections = searchIndex.sections || {};
    const rawAliases = searchIndex.globalSynonyms || {};
    const MIN_PREFIX_LEN = 3;
    const STOP_TOKENS = new Set([
        'и', 'в', 'во', 'на', 'не', 'с', 'со', 'к', 'ко', 'для', 'или', 'а', 'но', 'из', 'у', 'о', 'от'
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

    function selectQueryTokens(tokens) {
        if (tokens.length <= 1) return tokens;
        const filtered = tokens.filter((token) => !STOP_TOKENS.has(token));
        return filtered.length ? filtered : tokens;
    }

    function switchLayout(token, map) {
        return token
            .split('')
            .map((char) => map[char] || char)
            .join('');
    }

    function tokenVariants(token) {
        const normalizedToken = normalize(token);
        if (!normalizedToken) return [];
        const variants = new Set([normalizedToken]);
        const ruVariant = normalize(switchLayout(normalizedToken, EN_TO_RU));
        const enVariant = normalize(switchLayout(normalizedToken, RU_TO_EN));
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

    function buildEntryLookup(entries) {
        const lookup = {};
        Object.values(entries).forEach((entry) => {
            const phraseSet = new Set();
            const tokenSet = new Set();

            (Array.isArray(entry.keywords) ? entry.keywords : []).forEach((keyword) => {
                const phrase = normalize(keyword);
                if (!phrase) return;
                phraseSet.add(phrase);
                tokenize(phrase).forEach((token) => tokenSet.add(token));
            });

            tokenize(entry.corpus || '').forEach((token) => tokenSet.add(token));
            lookup[entry.id] = { phraseSet, tokenSet };
        });
        return lookup;
    }

    const aliasMap = buildAliasMap(rawAliases);
    const cardLookup = buildEntryLookup(cards);
    const sectionLookup = buildEntryLookup(sections);

    function expandToken(token) {
        const expanded = new Set();
        tokenVariants(token).forEach((variant) => {
            expanded.add(variant);
            const aliases = aliasMap.get(variant);
            if (aliases) {
                aliases.forEach((alias) => expanded.add(alias));
            }
        });
        return expanded;
    }

    function buildQueryState(query) {
        const normalizedQuery = normalize(query);
        const rawTokens = tokenize(normalizedQuery);
        const tokens = selectQueryTokens(rawTokens);

        if (!tokens.length) {
            return {
                hasQuery: false,
                normalizedQuery,
                tokenCandidates: [],
                phraseCandidates: [],
                prefixCandidates: []
            };
        }

        const tokenCandidates = new Set();
        const phraseCandidates = new Set();
        const prefixSourceTokens = new Set();

        if (normalizedQuery.includes(' ')) {
            phraseCandidates.add(normalizedQuery);
        }

        tokens.forEach((token) => {
            tokenVariants(token).forEach((variant) => {
                const normalizedVariant = normalize(variant);
                if (normalizedVariant) prefixSourceTokens.add(normalizedVariant);
            });

            expandToken(token).forEach((candidate) => {
                const normalizedCandidate = normalize(candidate);
                if (!normalizedCandidate) return;
                if (normalizedCandidate.includes(' ')) {
                    phraseCandidates.add(normalizedCandidate);
                } else {
                    tokenCandidates.add(normalizedCandidate);
                }
            });
        });

        return {
            hasQuery: tokenCandidates.size > 0 || phraseCandidates.size > 0,
            normalizedQuery,
            tokenCandidates: Array.from(tokenCandidates),
            phraseCandidates: Array.from(phraseCandidates),
            prefixCandidates: Array.from(prefixSourceTokens).filter(
                (token) => token.length >= MIN_PREFIX_LEN && !STOP_TOKENS.has(token)
            )
        };
    }

    function entryMatches(entry, queryState) {
        if (!entry || !queryState.hasQuery) return true;

        for (let i = 0; i < queryState.phraseCandidates.length; i += 1) {
            if (entry.phraseSet.has(queryState.phraseCandidates[i])) return true;
        }

        for (let i = 0; i < queryState.tokenCandidates.length; i += 1) {
            if (entry.tokenSet.has(queryState.tokenCandidates[i])) return true;
        }

        for (let i = 0; i < queryState.prefixCandidates.length; i += 1) {
            const prefix = queryState.prefixCandidates[i];
            for (const token of entry.tokenSet) {
                if (token.startsWith(prefix)) return true;
            }
        }

        return false;
    }

    function cardIdFromElement(cardElement) {
        return cardElement?.dataset?.requestType || cardElement?.dataset?.useful || '';
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

                const fallbackText = normalize(cardElement?.textContent || '');
                const fallbackTokens = new Set(tokenize(fallbackText));
                for (let i = 0; i < queryState.tokenCandidates.length; i += 1) {
                    if (fallbackTokens.has(queryState.tokenCandidates[i])) return true;
                }
                return false;
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
