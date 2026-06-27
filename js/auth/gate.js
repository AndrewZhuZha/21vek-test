/** Экран входа при requireAuth и обработка auth_error из URL. */
(function () {
    const authConfig = (window.PortalConfig && window.PortalConfig.auth) || {};
    if (!authConfig.enabled) return;

    const gateTagline = document.getElementById('portalTaglineGate');
    if (gateTagline && window.PortalConfig?.portalTagline) {
        gateTagline.textContent = window.PortalConfig.portalTagline;
    }

    const gate = document.getElementById('portalAuthGate');
    const appLayout = document.querySelector('.app-layout');
    const loginBtn = document.getElementById('portalAuthLoginBtn');
    const errorEl = document.getElementById('portalAuthGateError');

    function showGate() {
        if (gate) gate.classList.remove('hidden');
        if (appLayout) appLayout.setAttribute('aria-hidden', 'true');
        document.body.classList.add('portal-auth-gated');
    }

    function hideGate() {
        if (gate) gate.classList.add('hidden');
        if (appLayout) appLayout.removeAttribute('aria-hidden');
        document.body.classList.remove('portal-auth-gated');
    }

    function showAuthError(message) {
        if (!errorEl || !message) return;
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function stripAuthErrorFromUrl() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has('auth_error')) return;
            url.searchParams.delete('auth_error');
            const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
            window.history.replaceState({}, '', next);
        } catch (error) {
            // ignore
        }
    }

    function readAuthErrorFromUrl() {
        try {
            return new URLSearchParams(window.location.search).get('auth_error');
        } catch (error) {
            return null;
        }
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.PortalAuth.login();
        });
    }

    document.addEventListener('portal:auth-ready', () => {
        hideGate();
    });

    document.addEventListener('portal:auth-required', () => {
        showGate();
        const authError = readAuthErrorFromUrl();
        if (authError) {
            showAuthError(decodeURIComponent(authError));
            stripAuthErrorFromUrl();
        }
    });

    if (authConfig.requireAuth) {
        window.PortalAuth.whenReady().then((user) => {
            if (user) {
                hideGate();
            } else {
                showGate();
                const authError = readAuthErrorFromUrl();
                if (authError) {
                    showAuthError(decodeURIComponent(authError));
                    stripAuthErrorFromUrl();
                }
            }
        });
    }
})();
