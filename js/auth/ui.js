/** Блок профиля пользователя в шапке: аватар, меню, выход. */
(function () {
    const authConfig = (window.PortalConfig && window.PortalConfig.auth) || {};
    if (!authConfig.enabled) return;

    const userBlock = document.getElementById('portalAuthUser');
    const userBtn = document.getElementById('portalAuthUserBtn');
    const avatarImg = document.getElementById('portalAuthAvatar');
    const avatarInitials = document.getElementById('portalAuthAvatarInitials');
    const nameEl = document.getElementById('portalAuthName');
    const emailEl = document.getElementById('portalAuthEmail');
    const menuEl = document.getElementById('portalAuthMenu');
    const logoutBtn = document.getElementById('portalAuthLogoutBtn');
    const loginHeaderBtn = document.getElementById('portalAuthLoginHeaderBtn');

    function getInitials(displayName) {
        if (!displayName) return '?';
        const parts = displayName.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return displayName.slice(0, 2).toUpperCase();
    }

    function renderUser(user) {
        if (!user) {
            if (userBlock) userBlock.classList.add('hidden');
            if (loginHeaderBtn) loginHeaderBtn.classList.remove('hidden');
            return;
        }

        if (loginHeaderBtn) loginHeaderBtn.classList.add('hidden');
        if (userBlock) userBlock.classList.remove('hidden');

        const displayName = user.displayName || user.login || user.email || 'Пользователь';
        if (nameEl) nameEl.textContent = displayName;
        if (emailEl) emailEl.textContent = user.email || '';

        if (avatarImg && avatarInitials) {
            if (user.avatarUrl) {
                avatarImg.src = user.avatarUrl;
                avatarImg.alt = displayName;
                avatarImg.classList.remove('hidden');
                avatarInitials.classList.add('hidden');
                avatarInitials.textContent = '';
            } else {
                avatarImg.removeAttribute('src');
                avatarImg.alt = '';
                avatarImg.classList.add('hidden');
                avatarInitials.textContent = getInitials(displayName);
                avatarInitials.classList.remove('hidden');
            }
        }
    }

    function closeMenu() {
        if (menuEl) menuEl.classList.add('hidden');
        if (userBtn) userBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
        if (!menuEl || !userBtn) return;
        const isHidden = menuEl.classList.contains('hidden');
        if (isHidden) {
            menuEl.classList.remove('hidden');
            userBtn.setAttribute('aria-expanded', 'true');
        } else {
            closeMenu();
        }
    }

    if (userBtn) {
        userBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleMenu();
        });
    }

    document.addEventListener('click', () => {
        closeMenu();
    });

    if (menuEl) {
        menuEl.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

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
