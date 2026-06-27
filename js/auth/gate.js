/** Экран входа при requireAuth и обработка auth_error из URL. */
(function () {
    const authConfig = (window.PortalConfig && window.PortalConfig.auth) || {};
    const appLayout = document.querySelector('.app-layout');
    const skipLink = document.querySelector('.skip-link');

    function clearAuthPending() {
        document.documentElement.classList.remove('portal-auth-pending');
    }

    function revealPortal() {
        clearAuthPending();
        if (appLayout) appLayout.hidden = false;
        if (skipLink) skipLink.hidden = false;
    }

    function concealPortal() {
        if (appLayout) appLayout.hidden = true;
        if (skipLink) skipLink.hidden = true;
    }

    if (!authConfig.enabled || !authConfig.requireAuth) {
        revealPortal();
        return;
    }

    const gateTitle = document.getElementById('portalAuthGateTitle');
    if (gateTitle && window.PortalConfig?.portalTagline) {
        gateTitle.textContent = window.PortalConfig.portalTagline;
    }

    const gate = document.getElementById('portalAuthGate');
    const stepIntro = document.getElementById('portalAuthGateStepIntro');
    const stepConfirm = document.getElementById('portalAuthGateStepConfirm');
    const loginBtn = document.getElementById('portalAuthLoginBtn');
    const confirmBtn = document.getElementById('portalAuthConfirmBtn');
    const backBtn = document.getElementById('portalAuthBackBtn');
    const errorEl = document.getElementById('portalAuthGateError');
    const backendUnavailableMessage = 'Сервис авторизации временно недоступен. Попробуйте обновить страницу через минуту.';

    function showIntroStep() {
        if (stepIntro) stepIntro.classList.remove('hidden');
        if (stepConfirm) stepConfirm.classList.add('hidden');
        if (loginBtn && typeof loginBtn.focus === 'function') {
            requestAnimationFrame(() => {
                loginBtn.focus();
            });
        }
    }

    function showConfirmStep() {
        if (stepIntro) stepIntro.classList.add('hidden');
        if (stepConfirm) stepConfirm.classList.remove('hidden');
        if (confirmBtn && typeof confirmBtn.focus === 'function') {
            requestAnimationFrame(() => {
                confirmBtn.focus();
            });
        }
    }

    function showGate() {
        clearAuthPending();
        concealPortal();
        showIntroStep();
        if (gate) gate.classList.remove('hidden');
        if (appLayout) appLayout.setAttribute('aria-hidden', 'true');
        document.body.classList.add('portal-auth-gated');
        if (loginBtn && typeof loginBtn.focus === 'function') {
            requestAnimationFrame(() => {
                loginBtn.focus();
            });
        }
    }

    function hideGate() {
        if (gate) gate.classList.add('hidden');
        if (appLayout) appLayout.removeAttribute('aria-hidden');
        document.body.classList.remove('portal-auth-gated');
        revealPortal();
    }

    function showAuthError(message) {
        if (!errorEl || !message) return;
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function clearAuthError() {
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
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
            clearAuthError();
            showConfirmStep();
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            window.PortalAuth.login();
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showIntroStep();
        });
    }

    document.addEventListener('portal:auth-ready', () => {
        clearAuthError();
        hideGate();
    });

    document.addEventListener('portal:auth-required', (event) => {
        showGate();
        if (event.detail?.reason === 'backend_unavailable') {
            showAuthError(backendUnavailableMessage);
        }
        const authError = readAuthErrorFromUrl();
        if (authError) {
            showAuthError(decodeURIComponent(authError));
            stripAuthErrorFromUrl();
        }
    });

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
})();
