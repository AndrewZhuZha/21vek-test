/** Сохранение состояния тура: localStorage + cookie fallback. */
window.PortalTourStorage = (function () {
    function getTourConfig() {
        return (window.PortalConfig && window.PortalConfig.tour) || {};
    }

    function getStorageKey() {
        return getTourConfig().storageKey || 'portal-tour-v1';
    }

    function getCookieKey() {
        return getStorageKey();
    }

    function readCookie() {
        const prefix = `${getCookieKey()}=`;
        const entries = document.cookie ? document.cookie.split('; ') : [];
        for (let i = 0; i < entries.length; i += 1) {
            if (entries[i].indexOf(prefix) === 0) {
                try {
                    return JSON.parse(decodeURIComponent(entries[i].slice(prefix.length)));
                } catch (error) {
                    return null;
                }
            }
        }
        return null;
    }

    function writeCookie(state) {
        const value = encodeURIComponent(JSON.stringify(state));
        document.cookie = `${getCookieKey()}=${value}; path=/; max-age=31536000; SameSite=Lax`;
    }

    function readState() {
        try {
            const raw = window.localStorage.getItem(getStorageKey());
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (error) {
            // ignore blocked storage
        }
        return readCookie();
    }

    function writeState(state) {
        const payload = JSON.stringify(state);
        try {
            window.localStorage.setItem(getStorageKey(), payload);
        } catch (error) {
            // ignore storage errors
        }
        writeCookie(state);
    }

    function isCompleted() {
        const state = readState();
        return Boolean(state && state.completed);
    }

    function markCompleted() {
        writeState({
            completed: true,
            at: new Date().toISOString().slice(0, 10)
        });
    }

    function reset() {
        try {
            window.localStorage.removeItem(getStorageKey());
        } catch (error) {
            // ignore
        }
        document.cookie = `${getCookieKey()}=; path=/; max-age=0; SameSite=Lax`;
    }

    return {
        isCompleted,
        markCompleted,
        reset
    };
})();
