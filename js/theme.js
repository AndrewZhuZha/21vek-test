(function () {
    const cfg = window.PortalConfig || {};
    const storageKey = cfg.themeStorageKey || 'portal-theme';
    const defaultTheme = cfg.defaultTheme || 'light';
    const root = document.documentElement;

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function getStoredTheme() {
        try {
            const saved = window.localStorage.getItem(storageKey);
            return saved === 'dark' || saved === 'light' ? saved : null;
        } catch (error) {
            return null;
        }
    }

    function updateToggleButton(button, theme) {
        const isDark = theme === 'dark';
        button.setAttribute('aria-pressed', String(isDark));
        const icon = button.querySelector('.theme-toggle__icon');
        const label = button.querySelector('.theme-toggle__label');
        if (icon) icon.textContent = isDark ? '☀️' : '🌙';
        if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
    }

    function updateButtons(theme) {
        document.querySelectorAll('.theme-toggle').forEach(button => updateToggleButton(button, theme));
    }

    function applyTheme(theme, options) {
        const { persist = true } = options || {};
        const next = theme === 'dark' ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        updateButtons(next);
        if (persist) {
            try {
                window.localStorage.setItem(storageKey, next);
            } catch (error) {
                // ignore storage errors (private mode / policy)
            }
        }
        document.dispatchEvent(new CustomEvent('portal:theme-changed', { detail: { theme: next } }));
    }

    function getTheme() {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function setTheme(theme) {
        applyTheme(theme, { persist: true });
    }

    function toggleTheme() {
        applyTheme(getTheme() === 'dark' ? 'light' : 'dark', { persist: true });
    }

    function init() {
        const initial = getStoredTheme() || (defaultTheme === 'system' ? getSystemTheme() : defaultTheme);
        applyTheme(initial, { persist: false });

        document.querySelectorAll('#themeToggle, #sidebarThemeToggle').forEach(button => {
            button.addEventListener('click', toggleTheme);
        });
    }

    document.addEventListener('DOMContentLoaded', init);

    window.PortalTheme = {
        getTheme,
        setTheme,
        toggleTheme
    };
})();
