document.addEventListener('DOMContentLoaded', () => {
    initScrollToTop();

    const config = window.PortalConfig || {};
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const chipsRoot = document.getElementById('sectionNavChips');

    if (!sections.length || !chipsRoot) return;

    const navRegistry = new Map();
    let activeSectionId = '';
    let rafScheduled = false;
    let navLockSectionId = '';
    let navLockUntil = 0;

    function createChip(section) {
        const link = document.createElement('a');
        link.className = 'section-nav__chip';
        link.href = `#${section.id}`;
        link.dataset.targetId = section.id;
        link.innerHTML = `<span aria-hidden="true">${section.icon}</span><span>${section.label}</span>`;
        return link;
    }

    sections.forEach(section => {
        const chip = createChip(section);
        chipsRoot.appendChild(chip);
        navRegistry.set(section.id, { chip });
    });

    function isStickyNav() {
        const stickyNav = document.querySelector('.section-nav');
        return stickyNav && window.getComputedStyle(stickyNav).position === 'sticky';
    }

    function getAnchorLineY() {
        const stickyNav = document.querySelector('.section-nav');

        if (!isStickyNav()) {
            return Math.round(window.innerHeight * 0.24);
        }

        if (!stickyNav) {
            return Math.round(window.innerHeight * 0.24);
        }

        const rect = stickyNav.getBoundingClientRect();
        if (rect.bottom <= 0) {
            return Math.round(window.innerHeight * 0.24);
        }

        return Math.round(rect.bottom + 6);
    }

    function getStickyOffset() {
        const stickyNav = document.querySelector('.section-nav');
        if (!stickyNav) return 42;
        if (!isStickyNav()) return 24;
        const stickyTop = parseFloat(window.getComputedStyle(stickyNav).top) || 0;
        return Math.round(stickyNav.offsetHeight + stickyTop + 14);
    }

    function getVisibleSections() {
        return sections.map(section => {
            const node = document.getElementById(section.id);
            if (!node || node.classList.contains('is-hidden')) return null;
            return { id: section.id, node };
        }).filter(Boolean);
    }

    function syncVisibility() {
        sections.forEach(section => {
            const group = document.getElementById(section.id);
            const nodes = navRegistry.get(section.id);
            if (!group || !nodes) return;
            nodes.chip.hidden = group.classList.contains('is-hidden');
        });
    }

    function isChipFullyVisible(chip) {
        const container = chipsRoot;
        const chipLeft = chip.offsetLeft;
        const chipRight = chipLeft + chip.offsetWidth;
        const viewLeft = container.scrollLeft;
        const viewRight = viewLeft + container.clientWidth;
        return chipLeft >= viewLeft - 2 && chipRight <= viewRight + 2;
    }

    function scrollActiveChipIntoView(sectionId, { smooth = false } = {}) {
        const nodes = navRegistry.get(sectionId);
        const chip = nodes?.chip;
        if (!chip || chip.hidden) return;
        if (isChipFullyVisible(chip)) return;

        chip.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    function setActive(sectionId, { scrollChip = false, smoothChip = false } = {}) {
        if (!sectionId || activeSectionId === sectionId) return;
        activeSectionId = sectionId;
        navRegistry.forEach((nodes, id) => {
            const active = id === sectionId;
            nodes.chip.classList.toggle('is-active', active);
            if (active) {
                nodes.chip.setAttribute('aria-current', 'true');
                if (scrollChip) {
                    scrollActiveChipIntoView(sectionId, { smooth: smoothChip });
                }
            } else {
                nodes.chip.removeAttribute('aria-current');
            }
        });
    }

    function getCurrentSectionId() {
        const visibleSections = getVisibleSections();
        if (!visibleSections.length) return null;

        const pageHeight = document.documentElement.scrollHeight;
        const scrollBottom = window.scrollY + window.innerHeight;

        if (scrollBottom >= pageHeight - 2) {
            return visibleSections[visibleSections.length - 1].id;
        }

        if (window.scrollY <= 8) {
            return visibleSections[0].id;
        }

        const anchorY = getAnchorLineY();

        for (let i = 0; i < visibleSections.length; i += 1) {
            const { id, node } = visibleSections[i];
            const top = node.getBoundingClientRect().top;
            const nextSection = visibleSections[i + 1];
            const nextTop = nextSection
                ? nextSection.node.getBoundingClientRect().top
                : Number.POSITIVE_INFINITY;

            if (top <= anchorY && anchorY < nextTop) {
                return id;
            }
        }

        const firstTop = visibleSections[0].node.getBoundingClientRect().top;
        if (firstTop > anchorY) {
            return visibleSections[0].id;
        }

        return visibleSections[visibleSections.length - 1].id;
    }

    function navigateToSection(sectionId) {
        const target = document.getElementById(sectionId);
        if (!target) return;
        const top = window.scrollY + target.getBoundingClientRect().top - getStickyOffset();
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    function lockActiveSection(sectionId) {
        navLockSectionId = sectionId;
        navLockUntil = performance.now() + 700;
        setActive(sectionId, { scrollChip: true, smoothChip: true });
    }

    function scheduleActiveUpdate() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            if (navLockSectionId && performance.now() < navLockUntil) {
                setActive(navLockSectionId, { scrollChip: true, smoothChip: false });
                return;
            }
            navLockSectionId = '';
            const nextId = getCurrentSectionId();
            if (nextId) {
                setActive(nextId, { scrollChip: isStickyNav(), smoothChip: false });
            }
        });
    }

    syncVisibility();
    scheduleActiveUpdate();

    navRegistry.forEach(({ chip }) => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = chip.dataset.targetId;
            if (!targetId) return;
            lockActiveSection(targetId);
            navigateToSection(targetId);
            scheduleActiveUpdate();
        });
    });

    window.addEventListener('scroll', scheduleActiveUpdate, { passive: true });
    window.addEventListener('resize', scheduleActiveUpdate);
    document.addEventListener('portal:filter-changed', () => {
        syncVisibility();
        scheduleActiveUpdate();
    });
});

function initScrollToTop() {
    const button = document.getElementById('scrollToTopBtn');
    if (!button) return;

    const desktopMedia = window.matchMedia('(min-width: 1280px)');
    const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafScheduled = false;

    function isModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.active'));
    }

    function updateVisibility() {
        rafScheduled = false;
        const show = desktopMedia.matches
            && window.scrollY > 320
            && !isModalOpen();

        button.classList.toggle('is-visible', show);
        button.setAttribute('aria-hidden', String(!show));
    }

    function scheduleVisibilityUpdate() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(updateVisibility);
    }

    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: reduceMotionMedia.matches ? 'auto' : 'smooth'
        });
    });

    window.addEventListener('scroll', scheduleVisibilityUpdate, { passive: true });
    window.addEventListener('resize', scheduleVisibilityUpdate);
    desktopMedia.addEventListener('change', scheduleVisibilityUpdate);

    document.addEventListener('click', (event) => {
        if (event.target.closest('.modal-overlay')) {
            scheduleVisibilityUpdate();
        }
    }, true);

    scheduleVisibilityUpdate();
}
