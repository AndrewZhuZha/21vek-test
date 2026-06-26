// Cards filtering with smooth hide/show and section visibility sync.
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('cardSearch');
    const searchField = document.querySelector('.search-field');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const emptyState = document.getElementById('searchEmptyState');
    const searchSpinner = document.getElementById('searchSpinner');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const homeTitleBtn = document.getElementById('homeTitleBtn');
    const hideTimers = new WeakMap();
    const HIDE_ANIMATION_MS = 180;
    const VISIBILITY_SYNC_DELAY_MS = HIDE_ANIMATION_MS + 16;
    const FILTER_DEBOUNCE_MS = 110;
    const THINKING_MIN_MS = 180;
    const HOTKEY_HIGHLIGHT_MS = 1200;
    let filterDebounceTimer = null;
    let visibilitySyncTimer = null;
    let thinkingShownAt = 0;
    let thinkingHideTimer = null;
    let hotkeyHighlightTimer = null;
    let activeFilterCount = 0;
    let cachedCards = null;
    let cachedGroups = null;

    function getCards() {
        if (!cachedCards) {
            cachedCards = Array.from(document.querySelectorAll('.service-card'));
        }
        return cachedCards;
    }

    function getGroups() {
        if (!cachedGroups) {
            cachedGroups = Array.from(document.querySelectorAll('.section-group'));
        }
        return cachedGroups;
    }

    function beginFilterAnimation() {
        activeFilterCount += 1;
        document.documentElement.classList.add('is-search-filtering');
    }

    function endFilterAnimation() {
        activeFilterCount = Math.max(0, activeFilterCount - 1);
        if (activeFilterCount === 0) {
            document.documentElement.classList.remove('is-search-filtering');
        }
    }

    function scheduleWillChangeReset(card) {
        window.setTimeout(() => {
            if (!card.classList.contains('is-fading')) {
                card.style.willChange = '';
            }
        }, HIDE_ANIMATION_MS);
    }

    function clearHideTimer(card) {
        const timer = hideTimers.get(card);
        if (timer) {
            clearTimeout(timer);
            hideTimers.delete(card);
        }
    }

    function isModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.active'));
    }

    function updateSearchFieldState() {
        if (!searchInput) return;
        const hasValue = Boolean(searchInput.value.trim());
        if (searchField) {
            searchField.classList.toggle('has-value', hasValue);
        }
        if (searchClearBtn) {
            searchClearBtn.setAttribute('aria-hidden', String(!hasValue));
            searchClearBtn.tabIndex = hasValue ? 0 : -1;
        }
    }

    function setTypingState(active) {
        searchField?.classList.toggle('is-typing', active);
    }

    function setThinkingState(active) {
        if (thinkingHideTimer) {
            clearTimeout(thinkingHideTimer);
            thinkingHideTimer = null;
        }

        searchField?.classList.toggle('is-searching', active);

        if (!searchSpinner) return;

        if (active) {
            if (searchSpinner.classList.contains('hidden')) {
                searchSpinner.classList.remove('hidden');
                searchSpinner.setAttribute('aria-hidden', 'false');
                thinkingShownAt = Date.now();
            }
            return;
        }

        const elapsed = Date.now() - thinkingShownAt;
        const delay = Math.max(0, THINKING_MIN_MS - elapsed);
        thinkingHideTimer = setTimeout(() => {
            searchSpinner.classList.add('hidden');
            searchSpinner.setAttribute('aria-hidden', 'true');
            searchField?.classList.remove('is-searching');
            thinkingHideTimer = null;
        }, delay);
    }

    function showCard(card) {
        clearHideTimer(card);
        card.style.willChange = 'opacity';
        if (card.classList.contains('is-hidden')) {
            card.classList.remove('is-hidden');
            card.classList.add('is-fading');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    card.classList.remove('is-fading');
                    scheduleWillChangeReset(card);
                });
            });
            return;
        }
        card.classList.remove('is-fading');
        scheduleWillChangeReset(card);
    }

    function hideCard(card) {
        if (card.classList.contains('is-hidden')) return;
        clearHideTimer(card);
        card.style.willChange = 'opacity';
        card.classList.add('is-fading');
        const timer = setTimeout(() => {
            card.classList.add('is-hidden');
            card.classList.remove('is-fading');
            card.style.willChange = '';
            hideTimers.delete(card);
        }, HIDE_ANIMATION_MS);
        hideTimers.set(card, timer);
    }

    function updateGroupsVisibility() {
        let hasVisibleCards = false;
        getGroups().forEach(group => {
            const hasVisible = Array.from(group.querySelectorAll('.service-card'))
                .some(card => !card.classList.contains('is-hidden'));
            group.classList.toggle('is-hidden', !hasVisible);
            hasVisibleCards = hasVisibleCards || hasVisible;
        });
        return hasVisibleCards;
    }

    function updateEmptyState(query, hasVisibleCards) {
        if (!emptyState) return;
        const showEmptyState = Boolean((query || '').trim()) && !hasVisibleCards;
        emptyState.classList.toggle('hidden', !showEmptyState);
        emptyState.setAttribute('aria-hidden', String(!showEmptyState));
    }

    function dispatchFilterChanged() {
        document.dispatchEvent(new CustomEvent('portal:filter-changed'));
    }

    function applySectionOffset() {
        const stickyNav = document.querySelector('.section-nav');
        const navVisible = stickyNav && window.getComputedStyle(stickyNav).display !== 'none';
        const navSticky = navVisible && window.getComputedStyle(stickyNav).position === 'sticky';
        const stickyTop = navSticky ? (parseFloat(window.getComputedStyle(stickyNav).top) || 0) : 0;
        const offset = navSticky
            ? Math.round(stickyNav.offsetHeight + stickyTop + 14)
            : 24;
        getGroups().forEach(group => {
            group.style.scrollMarginTop = `${offset}px`;
        });
    }

    function syncFilterState(query) {
        const hasVisibleCards = updateGroupsVisibility();
        updateEmptyState(query, hasVisibleCards);
        setThinkingState(false);
        setTypingState(false);
        endFilterAnimation();
        dispatchFilterChanged();
    }

    function scheduleFilterStateSync(query) {
        if (visibilitySyncTimer) clearTimeout(visibilitySyncTimer);
        visibilitySyncTimer = setTimeout(() => {
            visibilitySyncTimer = null;
            syncFilterState(query);
        }, VISIBILITY_SYNC_DELAY_MS);
    }

    function filterCards() {
        const query = searchInput?.value || '';
        const normalizedQuery = query.trim().toLowerCase();
        const searchEngine = window.PortalSearch;
        const matcher = searchEngine?.createMatcher ? searchEngine.createMatcher(query) : null;
        const cards = getCards();

        requestAnimationFrame(() => {
            cards.forEach(card => {
                const title = `${card.dataset.title || ''} ${card.querySelector('.card-title')?.textContent || ''}`;
                const desc = card.querySelector('.card-desc')?.textContent || '';
                const full = `${title} ${desc} ${card.textContent}`.toLowerCase();
                const matches = matcher
                    ? matcher.matchesCard(card)
                    : (!normalizedQuery || full.includes(normalizedQuery));
                if (matches) showCard(card);
                else hideCard(card);
            });

            updateSearchFieldState();
            scheduleFilterStateSync(query);
        });
    }

    function queueFilter() {
        if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
        beginFilterAnimation();
        setTypingState(true);
        setThinkingState(true);
        updateSearchFieldState();
        filterDebounceTimer = setTimeout(() => {
            filterDebounceTimer = null;
            filterCards();
        }, FILTER_DEBOUNCE_MS);
    }

    function goToHome() {
        if (!searchInput) return;
        if (filterDebounceTimer) {
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = null;
        }
        beginFilterAnimation();
        searchInput.value = '';
        setTypingState(false);
        updateSearchFieldState();
        searchInput.blur();
        setThinkingState(false);
        filterCards();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function focusSearchWithHotkey() {
        if (!searchInput) return;
        searchInput.focus({ preventScroll: true });
        if (!searchField) return;
        searchField.classList.add('is-search-hotkey');
        if (hotkeyHighlightTimer) clearTimeout(hotkeyHighlightTimer);
        hotkeyHighlightTimer = setTimeout(() => {
            searchField.classList.remove('is-search-hotkey');
            hotkeyHighlightTimer = null;
        }, HOTKEY_HIGHLIGHT_MS);
    }

    function handleGlobalKeydown(event) {
        if (isModalOpen()) return;

        if (event.key === 'Escape' && searchInput?.value.trim()) {
            event.preventDefault();
            goToHome();
        }
    }

    function updateSearchPlaceholder() {
        if (!searchInput) return;
        const desktopMedia = window.matchMedia('(min-width: 768px)');
        const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
        if (desktopMedia.matches) {
            searchInput.placeholder = isMac ? 'Поиск… (⌘F)' : 'Поиск… (Ctrl+F)';
        } else {
            searchInput.placeholder = 'Поиск...';
        }
    }

    applySectionOffset();
    window.addEventListener('resize', applySectionOffset);
    window.addEventListener('orientationchange', () => {
        window.setTimeout(applySectionOffset, 80);
    });
    window.matchMedia('(min-width: 768px)').addEventListener('change', updateSearchPlaceholder);
    document.addEventListener('portal:filter-changed', applySectionOffset);

    updateSearchPlaceholder();

    if (searchInput) {
        searchInput.addEventListener('input', queueFilter);
    }

    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', goToHome);
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', goToHome);
    }

    if (homeTitleBtn) {
        homeTitleBtn.addEventListener('click', goToHome);
    }

    window.addEventListener('portal:focus-search', focusSearchWithHotkey);
    window.addEventListener('keydown', handleGlobalKeydown, true);

    setThinkingState(false);
    updateSearchFieldState();
    filterCards();
});
