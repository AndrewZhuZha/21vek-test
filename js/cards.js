// Cards filtering with smooth hide/show and section visibility sync.
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('cardSearch');
    const hideTimers = new WeakMap();

    function getCards() {
        return Array.from(document.querySelectorAll('.service-card'));
    }

    function getGroups() {
        return Array.from(document.querySelectorAll('.section-group'));
    }

    function clearHideTimer(card) {
        const timer = hideTimers.get(card);
        if (timer) {
            clearTimeout(timer);
            hideTimers.delete(card);
        }
    }

    function showCard(card) {
        clearHideTimer(card);
        if (card.classList.contains('is-hidden')) {
            card.classList.remove('is-hidden');
        }
        requestAnimationFrame(() => card.classList.remove('is-filtering-out'));
    }

    function hideCard(card) {
        if (card.classList.contains('is-hidden')) return;
        clearHideTimer(card);
        card.classList.add('is-filtering-out');
        const timer = setTimeout(() => {
            card.classList.add('is-hidden');
            card.classList.remove('is-filtering-out');
            hideTimers.delete(card);
        }, 150);
        hideTimers.set(card, timer);
    }

    function updateGroupsVisibility() {
        getGroups().forEach(group => {
            const hasVisible = Array.from(group.querySelectorAll('.service-card'))
                .some(card => !card.classList.contains('is-hidden'));
            group.classList.toggle('is-hidden', !hasVisible);
        });
    }

    function dispatchFilterChanged() {
        document.dispatchEvent(new CustomEvent('portal:filter-changed'));
    }

    function applySectionOffset() {
        const stickyNav = document.querySelector('.section-nav');
        const stickyVisible = stickyNav && window.getComputedStyle(stickyNav).display !== 'none';
        const stickyTop = stickyVisible ? (parseFloat(window.getComputedStyle(stickyNav).top) || 0) : 0;
        const offset = stickyVisible
            ? Math.round(stickyNav.offsetHeight + stickyTop + 14)
            : 42;
        getGroups().forEach(group => {
            group.style.scrollMarginTop = `${offset}px`;
        });
    }

    function filterCards() {
        const query = (searchInput?.value || '').trim().toLowerCase();

        getCards().forEach(card => {
            const title = `${card.dataset.title || ''} ${card.querySelector('.card-title')?.textContent || ''}`;
            const desc = card.querySelector('.card-desc')?.textContent || '';
            const full = `${title} ${desc} ${card.textContent}`.toLowerCase();
            const matches = !query || full.includes(query);
            if (matches) showCard(card);
            else hideCard(card);
        });

        setTimeout(() => {
            updateGroupsVisibility();
            dispatchFilterChanged();
        }, 170);
    }

    applySectionOffset();
    window.addEventListener('resize', applySectionOffset);

    if (searchInput) {
        searchInput.addEventListener('input', filterCards);
    }
});