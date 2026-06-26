(function () {
    const storageKey = 'portal-theme';
    const cookieName = storageKey + '=';

    function readThemeCookie() {
        const entries = document.cookie ? document.cookie.split('; ') : [];
        for (let i = 0; i < entries.length; i += 1) {
            if (entries[i].indexOf(cookieName) === 0) {
                const value = entries[i].slice(cookieName.length);
                if (value === 'dark' || value === 'light') return value;
            }
        }
        return null;
    }

    try {
        const stored = window.localStorage.getItem(storageKey);
        const initial = stored === 'dark' || stored === 'light' ? stored : readThemeCookie();
        if (initial) {
            document.documentElement.setAttribute('data-theme', initial);
            document.documentElement.setAttribute('data-user-theme', initial);
        }
    } catch (error) {
        const fallback = readThemeCookie();
        if (fallback) {
            document.documentElement.setAttribute('data-theme', fallback);
            document.documentElement.setAttribute('data-user-theme', fallback);
        }
    }
})();
