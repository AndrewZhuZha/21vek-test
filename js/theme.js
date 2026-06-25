(function () {
    const cfg = window.PortalConfig || {};
    const storageKey = cfg.themeStorageKey || 'portal-theme';
    const defaultTheme = cfg.defaultTheme || 'light';
    const transitionMs = Number(cfg.themeTransitionMs) > 0 ? Number(cfg.themeTransitionMs) : 140;
    const root = document.documentElement;
    const reduceMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    let isSwitching = false;
    let initialized = false;

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function getThemeCookie() {
        const cookiePrefix = `${storageKey}=`;
        const entries = document.cookie ? document.cookie.split('; ') : [];
        for (let i = 0; i < entries.length; i += 1) {
            if (entries[i].indexOf(cookiePrefix) === 0) {
                const value = entries[i].slice(cookiePrefix.length);
                if (value === 'dark' || value === 'light') return value;
            }
        }
        return null;
    }

    function setThemeCookie(theme) {
        document.cookie = `${storageKey}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    }

    function getStoredTheme() {
        try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved === 'dark' || saved === 'light') return saved;
        } catch (error) {
            // ignore blocked storage
        }
        return getThemeCookie();
    }

    function persistTheme(theme) {
        try {
            window.localStorage.setItem(storageKey, theme);
        } catch (error) {
            // ignore storage errors (private mode / policy)
        }
        setThemeCookie(theme);
        root.setAttribute('data-user-theme', theme);
    }

    function updateToggleButton(button, theme) {
        const isDark = theme === 'dark';
        button.setAttribute('aria-pressed', String(isDark));
        button.setAttribute('aria-disabled', String(isSwitching));
        button.disabled = isSwitching;
        const icon = button.querySelector('.theme-toggle__icon');
        const label = button.querySelector('.theme-toggle__label');
        if (icon) icon.textContent = isDark ? '☀️' : '🌙';
        if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
    }

    function updateButtons(theme) {
        document.querySelectorAll('.theme-toggle').forEach(button => updateToggleButton(button, theme));
    }

    function setThemeAttribute(theme) {
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-user-theme', theme);
        updateButtons(theme);
    }

    function finishThemeSwitch(theme) {
        isSwitching = false;
        root.classList.remove('theme-animating');
        root.classList.remove('theme-switching');
        updateButtons(theme);
        document.dispatchEvent(new CustomEvent('portal:theme-changed', { detail: { theme } }));
    }

    function applyTheme(theme, options) {
        const { persist = true, animate = true } = options || {};
        const next = theme === 'dark' ? 'dark' : 'light';

        if (persist) persistTheme(next);

        if (next === getTheme()) {
            setThemeAttribute(next);
            document.dispatchEvent(new CustomEvent('portal:theme-changed', { detail: { theme: next } }));
            return;
        }

        const shouldAnimate = animate && !reduceMotionQuery.matches;

        if (!shouldAnimate) {
            setThemeAttribute(next);
            document.dispatchEvent(new CustomEvent('portal:theme-changed', { detail: { theme: next } }));
            return;
        }

        if (isSwitching) return;
        isSwitching = true;
        updateButtons(getTheme());
        root.classList.add('theme-switching');

        if (typeof document.startViewTransition === 'function') {
            try {
                const transition = document.startViewTransition(() => {
                    setThemeAttribute(next);
                });
                transition.finished
                    .catch(() => {
                        // ignore interrupted transitions
                    })
                    .finally(() => finishThemeSwitch(next));
                return;
            } catch (error) {
                // fallback to CSS-based transition below
            }
        }

        root.classList.add('theme-animating');
        window.requestAnimationFrame(() => {
            setThemeAttribute(next);
            window.setTimeout(() => finishThemeSwitch(next), transitionMs);
        });
    }

    function getTheme() {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function setTheme(theme) {
        applyTheme(theme, { persist: true });
    }

    function toggleTheme() {
        if (isSwitching) return;
        applyTheme(getTheme() === 'dark' ? 'light' : 'dark', { persist: true });
    }

    function init() {
        if (initialized) return;
        initialized = true;

        const initial = getStoredTheme() || (defaultTheme === 'system' ? getSystemTheme() : defaultTheme);
        applyTheme(initial, { persist: true, animate: false });

        document.querySelectorAll('#themeToggle, #sidebarThemeToggle').forEach(button => {
            button.addEventListener('click', toggleTheme);
        });

        window.addEventListener('storage', event => {
            if (event.key !== storageKey) return;
            const next = event.newValue;
            if (next !== 'dark' && next !== 'light') return;
            applyTheme(next, { persist: false, animate: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.PortalTheme = {
        getTheme,
        setTheme,
        toggleTheme
    };
})();
