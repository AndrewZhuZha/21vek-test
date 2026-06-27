document.addEventListener('DOMContentLoaded', () => {
    const config = window.PortalConfig || {};
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const chipsRoot = document.getElementById('sectionNavChips');
    const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

    const navRegistry = new Map();
    let activeSectionId = '';
    let stickyOffset = 94;
    let sectionObserver = null;
    let suppressScrollSpy = false;
    let scrollIdleTimer = null;
    let manualScrollRaf = false;
    let programmaticScrollStartedAt = 0;
    const PROGRAMMATIC_SCROLL_MIN_MS = 500;

    function getScrollBehavior() {
        return reduceMotionMedia.matches ? 'auto' : 'smooth';
    }

    function refreshStickyOffset() {
        const stickyNav = document.querySelector('.section-nav');
        if (!stickyNav) {
            stickyOffset = 24;
            return stickyOffset;
        }

        const style = window.getComputedStyle(stickyNav);
        if (style.position !== 'sticky') {
            stickyOffset = 24;
            return stickyOffset;
        }

        const stickyTop = parseFloat(style.top) || 0;
        stickyOffset = Math.round(stickyNav.offsetHeight + stickyTop + 14);
        return stickyOffset;
    }

    function getVisibleSectionNodes() {
        return sections.map(section => {
            const node = document.getElementById(section.id);
            if (!node || node.classList.contains('is-hidden')) return null;
            return { id: section.id, node };
        }).filter(Boolean);
    }

    function getFirstVisibleSectionId() {
        const visible = getVisibleSectionNodes();
        return visible[0]?.id || '';
    }

    function getLastVisibleSectionId() {
        const visible = getVisibleSectionNodes();
        return visible[visible.length - 1]?.id || '';
    }

    function beginProgrammaticScroll() {
        suppressScrollSpy = true;
        programmaticScrollStartedAt = performance.now();
        document.documentElement.classList.add('is-programmatic-scroll');
    }

    function isScrollSpySuppressed() {
        return suppressScrollSpy;
    }

    function isChipFullyVisible(chip) {
        const chipLeft = chip.offsetLeft;
        const chipRight = chipLeft + chip.offsetWidth;
        const viewLeft = chipsRoot.scrollLeft;
        const viewRight = viewLeft + chipsRoot.clientWidth;
        return chipLeft >= viewLeft - 2 && chipRight <= viewRight + 2;
    }

    function scrollActiveChipIntoView(sectionId, { smooth = false } = {}) {
        const chip = navRegistry.get(sectionId)?.chip;
        if (!chip || chip.hidden || isChipFullyVisible(chip)) return;

        const behavior = smooth && !reduceMotionMedia.matches ? 'smooth' : 'auto';
        chipsRoot.scrollTo({
            left: Math.max(0, chip.offsetLeft - 12),
            behavior
        });
    }

    function setActive(sectionId, { scrollChip = false, smoothChip = false } = {}) {
        if (!sectionId || activeSectionId === sectionId) {
            if (scrollChip) scrollActiveChipIntoView(sectionId, { smooth: smoothChip });
            return;
        }

        activeSectionId = sectionId;
        navRegistry.forEach((nodes, id) => {
            const active = id === sectionId;
            nodes.chip.classList.toggle('is-active', active);
            if (active) {
                nodes.chip.setAttribute('aria-current', 'true');
                if (scrollChip) scrollActiveChipIntoView(sectionId, { smooth: smoothChip });
            } else {
                nodes.chip.removeAttribute('aria-current');
            }
        });
    }

    function resolveActiveSectionFromScroll() {
        if (isScrollSpySuppressed()) return;

        const visibleSections = getVisibleSectionNodes();
        if (!visibleSections.length) return;

        if (window.scrollY <= 8) {
            setActive(getFirstVisibleSectionId(), { scrollChip: true });
            return;
        }

        const pageHeight = document.documentElement.scrollHeight;
        if (window.scrollY + window.innerHeight >= pageHeight - 2) {
            setActive(getLastVisibleSectionId(), { scrollChip: true });
            return;
        }

        const anchorY = refreshStickyOffset() + 8;
        for (let i = 0; i < visibleSections.length; i += 1) {
            const { id, node } = visibleSections[i];
            const top = node.getBoundingClientRect().top;
            const nextTop = visibleSections[i + 1]
                ? visibleSections[i + 1].node.getBoundingClientRect().top
                : Number.POSITIVE_INFINITY;

            if (top <= anchorY && anchorY < nextTop) {
                setActive(id, { scrollChip: true });
                return;
            }
        }
    }

    function setupSectionObserver() {
        if (!window.IntersectionObserver) return;

        if (sectionObserver) sectionObserver.disconnect();

        refreshStickyOffset();
        sectionObserver = new IntersectionObserver((entries) => {
            if (isScrollSpySuppressed()) return;

            const intersecting = entries.filter(entry => entry.isIntersecting);
            if (!intersecting.length) return;

            if (window.scrollY <= 8) {
                setActive(getFirstVisibleSectionId());
                return;
            }

            intersecting.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            const anchorY = stickyOffset + 8;
            const candidate = intersecting.find(entry => entry.boundingClientRect.top <= anchorY + 4)
                || intersecting[0];

            if (candidate?.target?.id) {
                setActive(candidate.target.id, { scrollChip: true });
            }
        }, {
            root: null,
            rootMargin: `-${stickyOffset + 8}px 0px -58% 0px`,
            threshold: [0, 0.05, 0.15]
        });

        getVisibleSectionNodes().forEach(({ node }) => {
            sectionObserver.observe(node);
        });
    }

    function syncVisibility() {
        sections.forEach(section => {
            const group = document.getElementById(section.id);
            const nodes = navRegistry.get(section.id);
            if (!group || !nodes) return;
            nodes.chip.hidden = group.classList.contains('is-hidden');
        });
        setupSectionObserver();
    }

    function navigateToSection(sectionId) {
        const target = document.getElementById(sectionId);
        if (!target) return;

        beginProgrammaticScroll();
        setActive(sectionId);

        const top = window.scrollY + target.getBoundingClientRect().top - refreshStickyOffset();
        window.scrollTo({
            top: Math.max(0, top),
            behavior: getScrollBehavior()
        });

        // Horizontal chip scroll after vertical scroll starts — avoids snap fighting page animation.
        requestAnimationFrame(() => {
            scrollActiveChipIntoView(sectionId, { smooth: !reduceMotionMedia.matches });
        });
    }

    function scrollToTop() {
        beginProgrammaticScroll();
        setActive(getFirstVisibleSectionId());

        window.scrollTo({
            top: 0,
            behavior: getScrollBehavior()
        });
    }

    function onManualScroll() {
        if (suppressScrollSpy || sectionObserver) return;
        if (manualScrollRaf) return;
        manualScrollRaf = true;
        requestAnimationFrame(() => {
            manualScrollRaf = false;
            resolveActiveSectionFromScroll();
        });
    }

    function onScrollSettled() {
        const elapsed = performance.now() - programmaticScrollStartedAt;
        if (elapsed < PROGRAMMATIC_SCROLL_MIN_MS) {
            scrollIdleTimer = window.setTimeout(onScrollSettled, PROGRAMMATIC_SCROLL_MIN_MS - elapsed);
            return;
        }

        suppressScrollSpy = false;
        document.documentElement.classList.remove('is-programmatic-scroll');
        resolveActiveSectionFromScroll();
    }

    function scheduleScrollSettled() {
        if (!suppressScrollSpy) return;
        if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
        scrollIdleTimer = window.setTimeout(onScrollSettled, 120);
    }

    if (sections.length && chipsRoot) {
        sections.forEach(section => {
            const chip = document.createElement('a');
            chip.className = 'section-nav__chip';
            chip.href = `#${section.id}`;
            chip.dataset.targetId = section.id;
            chip.innerHTML = `<span aria-hidden="true">${section.icon}</span><span>${section.label}</span>`;
            chipsRoot.appendChild(chip);
            navRegistry.set(section.id, { chip });
        });

        syncVisibility();
        resolveActiveSectionFromScroll();

        navRegistry.forEach(({ chip }) => {
            chip.addEventListener('click', (event) => {
                event.preventDefault();
                const targetId = chip.dataset.targetId;
                if (!targetId) return;
                navigateToSection(targetId);
            });
        });

        document.addEventListener('portal:filter-changed', syncVisibility);

        window.addEventListener('scroll', () => {
            scheduleScrollSettled();
            onManualScroll();
        }, { passive: true });

        if ('onscrollend' in window) {
            window.addEventListener('scrollend', onScrollSettled, { passive: true });
        }

        window.addEventListener('resize', () => {
            refreshStickyOffset();
            setupSectionObserver();
            resolveActiveSectionFromScroll();
        });

        document.addEventListener('portal:scroll-to-top', scrollToTop);

        window.PortalNav = {
            scrollToTop,
            setActive,
            refreshStickyOffset
        };
    }

    initScrollToTop(scrollToTop);
    initSoonTooltip();
});

function initSoonTooltip() {
    const tip = document.getElementById('portalSoonTip');
    const placeholders = document.querySelectorAll('.header-link-btn--placeholder');
    if (!tip || !placeholders.length) return;

    let visible = false;
    const offset = 14;

    function position(clientX, clientY) {
        tip.style.left = `${clientX + offset}px`;
        tip.style.top = `${clientY + offset}px`;
    }

    function show(event) {
        visible = true;
        tip.classList.remove('hidden');
        tip.setAttribute('aria-hidden', 'false');
        position(event.clientX, event.clientY);
    }

    function hide() {
        visible = false;
        tip.classList.add('hidden');
        tip.setAttribute('aria-hidden', 'true');
    }

    placeholders.forEach((element) => {
        element.addEventListener('mouseenter', show);
        element.addEventListener('mousemove', (event) => {
            if (visible) position(event.clientX, event.clientY);
        });
        element.addEventListener('mouseleave', hide);
    });
}

function initScrollToTop(scrollToTopHandler) {
    const button = document.getElementById('scrollToTopBtn');
    if (!button) return;
    const footer = document.getElementById('pageFooter');

    let rafScheduled = false;
    let isVisible = false;
    let lastLift = -1;

    function isModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.active'));
    }

    function updateVisibility() {
        rafScheduled = false;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const showThreshold = 340;
        const hideThreshold = 260;
        let show = isVisible ? scrollY > hideThreshold : scrollY > showThreshold;
        if (isModalOpen()) {
            show = false;
        }

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const footerTop = footer ? footer.getBoundingClientRect().top : viewportHeight + 1;
        const overlap = Math.max(0, viewportHeight - footerTop);
        const baseBottom = window.matchMedia('(min-width: 1280px)').matches ? 28 : 20;
        const extraGap = 12;
        // Keep the button fully above the visible footer area.
        const rawLift = overlap + extraGap - baseBottom;
        const lift = rawLift > 0 ? Math.round(rawLift) : 0;
        if (lift !== lastLift) {
            button.style.setProperty('--scroll-to-top-lift', `${lift}px`);
            lastLift = lift;
        }

        isVisible = show;

        // Avoid aria-hidden on a focused control (a11y warning in Chromium).
        if (!show && button === document.activeElement && typeof button.blur === 'function') {
            button.blur();
        }

        button.classList.toggle('is-visible', show);
        button.setAttribute('aria-hidden', String(!show));
        button.tabIndex = show ? 0 : -1;
    }

    function scheduleVisibilityUpdate() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(updateVisibility);
    }

    button.addEventListener('click', () => {
        if (typeof scrollToTopHandler === 'function') {
            scrollToTopHandler();
            return;
        }

        window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    });

    window.addEventListener('scroll', scheduleVisibilityUpdate, { passive: true });
    window.addEventListener('resize', scheduleVisibilityUpdate);

    document.addEventListener('click', (event) => {
        if (event.target.closest('.modal-overlay')) {
            scheduleVisibilityUpdate();
        }
    }, true);

    scheduleVisibilityUpdate();
}
