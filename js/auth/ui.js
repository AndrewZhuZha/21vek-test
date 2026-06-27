/** Блок профиля пользователя в шапке: аватар, меню, выход. */
(function () {
    const authConfig = (window.PortalConfig && window.PortalConfig.auth) || {};
    if (!authConfig.enabled) return;

    const userBlock = document.getElementById('portalAuthUser');
    const userBtn = document.getElementById('portalAuthUserBtn');
    const avatarImg = document.getElementById('portalAuthAvatar');
    const avatarInitials = document.getElementById('portalAuthAvatarInitials');
    const nameEl = document.getElementById('portalAuthName');
    const menuAvatarImg = document.getElementById('portalAuthMenuAvatar');
    const menuAvatarInitials = document.getElementById('portalAuthMenuAvatarInitials');
    const menuNameEl = document.getElementById('portalAuthMenuName');
    const menuPositionEl = document.getElementById('portalAuthMenuPosition');
    const emailEl = document.getElementById('portalAuthEmail');
    const menuEl = document.getElementById('portalAuthMenu');
    const logoutBtn = document.getElementById('portalAuthLogoutBtn');
    const loginHeaderBtn = document.getElementById('portalAuthLoginHeaderBtn');
    const headerThemeBtn = document.getElementById('themeToggleHeader');
    let themeSwitching = false;
    let menuOpenBeforeThemeSwitch = false;

    function getInitials(displayName) {
        if (!displayName) return '?';
        const parts = displayName.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return displayName.slice(0, 2).toUpperCase();
    }

    function resolvePosition(user) {
        if (!user) return '';
        if (user.position) return String(user.position).trim();

        const map = authConfig.positionByEmail;
        if (map && typeof map === 'object') {
            const fromMap = map[user.email] || map[user.login];
            if (fromMap) return String(fromMap).trim();
        }

        return '';
    }

    function resolvePositionLabel(user) {
        const position = resolvePosition(user);
        if (position) return position;
        if (user?.department) return String(user.department).trim();
        return '';
    }

    function isAllowedAvatarUrl(avatarUrl) {
        if (!avatarUrl || typeof avatarUrl !== 'string') {
            return false;
        }
        try {
            const url = new URL(avatarUrl);
            return url.protocol === 'https:' && (
                url.hostname === 'avatars.yandex.net' ||
                url.hostname.endsWith('.yandex.net')
            );
        } catch (error) {
            return false;
        }
    }

    function showAvatarInitials(displayName, imgEl, initialsEl) {
        imgEl.removeAttribute('src');
        imgEl.alt = '';
        imgEl.classList.add('hidden');
        initialsEl.textContent = getInitials(displayName);
        initialsEl.classList.remove('hidden');
    }

    function renderAvatarPair(displayName, avatarUrl, imgEl, initialsEl) {
        if (!imgEl || !initialsEl) return;

        const safeAvatarUrl = isAllowedAvatarUrl(avatarUrl) ? avatarUrl : null;

        if (!safeAvatarUrl) {
            showAvatarInitials(displayName, imgEl, initialsEl);
            return;
        }

        imgEl.onload = null;
        imgEl.onerror = () => {
            showAvatarInitials(displayName, imgEl, initialsEl);
        };
        imgEl.src = safeAvatarUrl;
        imgEl.alt = displayName;
        imgEl.classList.remove('hidden');
        initialsEl.classList.add('hidden');
        initialsEl.textContent = '';
    }

    function syncHeaderThemeVisibility(isLoggedIn) {
        if (!headerThemeBtn) return;
        if (isLoggedIn || authConfig.requireAuth) {
            headerThemeBtn.classList.add('hidden');
            return;
        }
        headerThemeBtn.classList.remove('hidden');
    }

    function renderUser(user) {
        closeMenu();

        if (!user) {
            if (userBlock) userBlock.classList.add('hidden');
            if (loginHeaderBtn) loginHeaderBtn.classList.remove('hidden');
            syncHeaderThemeVisibility(false);
            return;
        }

        if (loginHeaderBtn) loginHeaderBtn.classList.add('hidden');
        if (userBlock) userBlock.classList.remove('hidden');
        syncHeaderThemeVisibility(true);

        const displayName = user.displayName || user.login || user.email || 'Пользователь';
        const emailLine = user.email || user.login || '';
        const positionLine = resolvePositionLabel(user);

        if (menuNameEl) menuNameEl.textContent = displayName;
        if (nameEl) nameEl.textContent = displayName;
        if (menuPositionEl) {
            menuPositionEl.textContent = positionLine || 'Должность не указана';
            menuPositionEl.classList.toggle('portal-auth-menu__position--empty', !positionLine);
        }
        if (emailEl) {
            emailEl.textContent = emailLine;
            emailEl.hidden = !emailLine;
        }

        if (userBtn) {
            userBtn.setAttribute('aria-label', `Меню пользователя: ${displayName}`);
        }

        renderAvatarPair(displayName, user.avatarUrl, avatarImg, avatarInitials);
        renderAvatarPair(displayName, user.avatarUrl, menuAvatarImg, menuAvatarInitials);
    }

    function isMenuOpen() {
        return Boolean(menuEl && !menuEl.classList.contains('hidden'));
    }

    function getMenuFocusableItems() {
        if (!menuEl) return [];
        return Array.from(
            menuEl.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
        ).filter((node) => !node.classList.contains('hidden') && !node.hasAttribute('hidden'));
    }

    function closeMenu(options = {}) {
        const { restoreFocus = false } = options;
        if (themeSwitching) return;
        if (menuEl) menuEl.classList.add('hidden');
        if (userBtn) userBtn.setAttribute('aria-expanded', 'false');
        if (restoreFocus && userBtn) {
            userBtn.focus();
        }
    }

    function openMenu(options = {}) {
        const { focusFirst = false } = options;
        if (!menuEl || !userBtn) return;
        menuEl.classList.remove('hidden');
        userBtn.setAttribute('aria-expanded', 'true');
        if (focusFirst) {
            const [firstAction] = getMenuFocusableItems();
            if (firstAction) {
                firstAction.focus();
            }
        }
    }

    function toggleMenu() {
        if (!menuEl || !userBtn) return;
        if (menuEl.classList.contains('hidden')) {
            openMenu();
        } else {
            closeMenu();
        }
    }

    if (userBtn) {
        userBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMenu();
        });

        userBtn.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            if (!isMenuOpen()) {
                openMenu({ focusFirst: true });
                return;
            }
            const [firstAction] = getMenuFocusableItems();
            if (firstAction) firstAction.focus();
        });
    }

    if (menuEl) {
        menuEl.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        menuEl.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closeMenu({ restoreFocus: true });
        });
    }

    document.addEventListener('portal:theme-switching', (event) => {
        themeSwitching = Boolean(event.detail && event.detail.active);
        if (themeSwitching) {
            menuOpenBeforeThemeSwitch = isMenuOpen();
            return;
        }

        if (menuOpenBeforeThemeSwitch) {
            openMenu();
        }
        menuOpenBeforeThemeSwitch = false;
    });

    document.addEventListener('click', (event) => {
        if (themeSwitching) return;
        if (event.target.closest('.portal-auth-user')) {
            return;
        }
        closeMenu();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isMenuOpen()) {
            closeMenu({ restoreFocus: true });
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.PortalAuth.logout();
        });
    }

    if (loginHeaderBtn) {
        loginHeaderBtn.addEventListener('click', () => {
            window.PortalAuth.login();
        });
    }

    document.addEventListener('portal:auth-ready', (event) => {
        renderUser(event.detail && event.detail.user);
    });

    document.addEventListener('portal:auth-required', () => {
        renderUser(null);
    });

    window.PortalAuth.whenReady().then((user) => {
        renderUser(user);
    });
})();
