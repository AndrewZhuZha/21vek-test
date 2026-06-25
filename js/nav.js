document.addEventListener('DOMContentLoaded', () => {
    const config = window.PortalConfig || {};
    const sections = Array.isArray(config.sections) ? config.sections : [];
    const chipsRoot = document.getElementById('sectionNavChips');
    const sidebarRoot = document.getElementById('sidebarNavList');

    if (!sections.length || !chipsRoot || !sidebarRoot) return;

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

    function createSidebarItem(section) {
        const link = document.createElement('a');
        link.className = 'sidebar-nav__item';
        link.href = `#${section.id}`;
        link.dataset.targetId = section.id;
        link.innerHTML = `<span class="sidebar-nav__item-icon" aria-hidden="true">${section.icon}</span><span>${section.label}</span>`;
        return link;
    }

    sections.forEach(section => {
        const chip = createChip(section);
        const sidebarItem = createSidebarItem(section);
        chipsRoot.appendChild(chip);
        sidebarRoot.appendChild(sidebarItem);
        navRegistry.set(section.id, { chip, sidebarItem });
    });

    function setActive(sectionId) {
        if (!sectionId || activeSectionId === sectionId) return;
        activeSectionId = sectionId;
        navRegistry.forEach((nodes, id) => {
            const active = id === sectionId;
            nodes.chip.classList.toggle('is-active', active);
            nodes.sidebarItem.classList.toggle('is-active', active);
            if (active) {
                nodes.chip.setAttribute('aria-current', 'true');
                nodes.sidebarItem.setAttribute('aria-current', 'true');
            } else {
                nodes.chip.removeAttribute('aria-current');
                nodes.sidebarItem.removeAttribute('aria-current');
            }
        });
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
            const hidden = group.classList.contains('is-hidden');
            nodes.chip.hidden = hidden;
            nodes.sidebarItem.hidden = hidden;
        });
    }

    function getAnchorLineY() {
        const stickyNav = document.querySelector('.section-nav');
        const stickyVisible = stickyNav && window.getComputedStyle(stickyNav).display !== 'none';
        if (!stickyVisible) return Math.round(window.innerHeight * 0.24);
        return Math.round(stickyNav.getBoundingClientRect().bottom + 6);
    }

    function getStickyOffset() {
        const stickyNav = document.querySelector('.section-nav');
        const stickyVisible = stickyNav && window.getComputedStyle(stickyNav).display !== 'none';
        if (!stickyVisible) return 42;
        const stickyTop = parseFloat(window.getComputedStyle(stickyNav).top) || 0;
        return Math.round(stickyNav.offsetHeight + stickyTop + 14);
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
        setActive(sectionId);
    }

    function getCurrentSectionId() {
        const visibleSections = getVisibleSections();
        if (!visibleSections.length) return null;

        const anchorY = getAnchorLineY();
        let current = visibleSections[0].id;
        for (const section of visibleSections) {
            if (section.node.getBoundingClientRect().top <= anchorY) {
                current = section.id;
            } else {
                break;
            }
        }
        return current;
    }

    function scheduleActiveUpdate() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            if (navLockSectionId && performance.now() < navLockUntil) {
                setActive(navLockSectionId);
                return;
            }
            navLockSectionId = '';
            const nextId = getCurrentSectionId();
            if (nextId) setActive(nextId);
        });
    }

    syncVisibility();
    scheduleActiveUpdate();

    navRegistry.forEach(({ chip, sidebarItem }) => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = chip.dataset.targetId;
            if (!targetId) return;
            lockActiveSection(targetId);
            navigateToSection(targetId);
            scheduleActiveUpdate();
        });
        sidebarItem.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = sidebarItem.dataset.targetId;
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

    const sidebarResetBtn = document.getElementById('sidebarResetPasswordBtn');
    const topResetBtn = document.getElementById('resetPasswordBtn');
    if (sidebarResetBtn && topResetBtn) {
        sidebarResetBtn.addEventListener('click', () => topResetBtn.click());
    }
});
