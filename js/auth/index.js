/** Авторизация через Yandex 360: сессия, gate, события portal:auth-*. */
(function () {
    const noopApi = {
        init: function () { return Promise.resolve(); },
        whenReady: function () { return Promise.resolve(); },
        isAuthenticated: function () { return false; },
        getUser: function () { return null; },
        login: function () {},
        logout: function () { return Promise.resolve(); },
        isEnabled: function () { return false; },
        isRequired: function () { return false; }
    };

    function getAuthConfig() {
        return (window.PortalConfig && window.PortalConfig.auth) || {};
    }

    const authConfig = getAuthConfig();
    if (!authConfig.enabled) {
        window.PortalAuth = noopApi;
        return;
    }

    let currentUser = null;
    let ready = false;
    let readyPromise = null;
    let readyResolve = null;

    function dispatch(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }

    function createReadyPromise() {
        readyPromise = new Promise((resolve) => {
            readyResolve = resolve;
        });
    }

    createReadyPromise();

    function finishReady(user) {
        ready = true;
        currentUser = user;
        if (readyResolve) {
            readyResolve(user);
            readyResolve = null;
        }
        dispatch('portal:auth-ready', { user: user });
    }

    function finishRequired(reason) {
        ready = true;
        currentUser = null;
        if (readyResolve) {
            readyResolve(null);
            readyResolve = null;
        }
        dispatch('portal:auth-required', { reason: reason || null });
    }

    async function syncAuthConfigFromBackend() {
        try {
            const response = await fetch('/api/auth/config-check', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) {
                return;
            }

            const data = await response.json();
            if (!window.PortalConfig.auth) {
                window.PortalConfig.auth = {};
            }
            if (Array.isArray(data.guestRequestTypes)) {
                window.PortalConfig.auth.guestRequestTypes = data.guestRequestTypes;
            }
            if (typeof data.trackerDemoMode === 'boolean') {
                window.PortalConfig.demoMode = data.trackerDemoMode;
            }
        } catch (error) {
            // backend недоступен — остаётся config.js / config.local.js
        }
    }

    async function fetchCurrentUser() {
        const url = authConfig.userInfoUrl || '/api/auth/me';
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });

        if (response.status === 401) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`auth_me_${response.status}`);
        }

        return response.json();
    }

    function login() {
        const url = authConfig.loginUrl || '/api/auth/login';
        window.location.href = url;
    }

    async function logout() {
        const url = authConfig.logoutUrl || '/api/auth/logout';
        await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        dispatch('portal:auth-logout');
        window.location.reload();
    }

    async function init() {
        if (ready) {
            return currentUser;
        }

        try {
            const [user] = await Promise.all([
                fetchCurrentUser(),
                syncAuthConfigFromBackend()
            ]);
            if (user) {
                finishReady(user);
                return user;
            }

            if (authConfig.requireAuth) {
                finishRequired();
                return null;
            }

            finishReady(null);
            return null;
        } catch (error) {
            console.error('PortalAuth.init:', error);
            if (authConfig.requireAuth) {
                finishRequired('backend_unavailable');
                return null;
            }
            finishReady(null);
            return null;
        }
    }

    function whenReady() {
        if (ready) {
            return Promise.resolve(currentUser);
        }
        return readyPromise;
    }

    window.PortalAuth = {
        init,
        whenReady,
        isAuthenticated: function () { return Boolean(currentUser); },
        getUser: function () { return currentUser; },
        login,
        logout,
        isEnabled: function () { return true; },
        isRequired: function () { return Boolean(authConfig.requireAuth); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); });
    } else {
        init();
    }
})();
