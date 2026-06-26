/** Мини-экскурсия по порталу: автозапуск, API, replay-кнопка. */
(function () {
    const noopApi = {
        start: function () {},
        reset: function () {},
        isCompleted: function () { return true; },
        skip: function () {}
    };

    const tourConfig = window.PortalConfig && window.PortalConfig.tour;
    if (!tourConfig || !tourConfig.enabled) {
        window.PortalTour = noopApi;
        return;
    }

    const storage = window.PortalTourStorage;
    const spotlight = window.PortalTourSpotlight;
    const steps = window.PortalTourSteps || [];

    let currentIndex = -1;
    let running = false;
    let modalObserver = null;
    let pausedForModal = false;

    function dispatch(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }

    function getUrlTourParam() {
        try {
            return new URLSearchParams(window.location.search).get('tour');
        } catch (error) {
            return null;
        }
    }

    function stripTourParamFromUrl() {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.has('tour')) return;
            url.searchParams.delete('tour');
            const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash;
            window.history.replaceState({}, '', next);
        } catch (error) {
            // ignore
        }
    }

    function setupReplayButton() {
        const selector = tourConfig.replayButtonSelector || '#tourReplayBtn';
        const button = document.querySelector(selector);
        if (!button) return;

        if (!tourConfig.showReplayButton) {
            button.classList.add('hidden');
            button.setAttribute('aria-hidden', 'true');
            button.tabIndex = -1;
            return;
        }

        button.classList.remove('hidden');
        button.setAttribute('aria-hidden', 'false');
        button.tabIndex = 0;
        button.addEventListener('click', () => {
            start({ force: true });
        });
    }

    function watchModals() {
        if (modalObserver) return;

        modalObserver = new MutationObserver(() => {
            if (!running) return;
            if (spotlight.isModalOpen()) {
                if (!pausedForModal) {
                    pausedForModal = true;
                    spotlight.destroy();
                }
            } else if (pausedForModal) {
                pausedForModal = false;
                showStepAt(currentIndex);
            }
        });

        document.querySelectorAll('.modal-overlay').forEach((overlay) => {
            modalObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
        });
    }

    function unwatchModals() {
        if (modalObserver) {
            modalObserver.disconnect();
            modalObserver = null;
        }
        pausedForModal = false;
    }

    function finish(skipped) {
        running = false;
        currentIndex = -1;
        spotlight.teardown();
        unwatchModals();
        storage.markCompleted();
        dispatch(skipped ? 'portal:tour-skipped' : 'portal:tour-completed');
    }

    function skip() {
        if (!running) return;
        finish(true);
    }

    function showStepAt(index) {
        if (spotlight.isModalOpen()) {
            pausedForModal = true;
            spotlight.destroy();
            return;
        }

        while (index < steps.length) {
            const step = steps[index];
            const shown = spotlight.showStep(step, index, steps.length, {
                onNext: function () {
                    if (index >= steps.length - 1) {
                        finish(false);
                    } else {
                        currentIndex = index + 1;
                        showStepAt(currentIndex);
                    }
                },
                onBack: function () {
                    if (index > 0) {
                        currentIndex = index - 1;
                        showStepAt(currentIndex);
                    }
                },
                onSkip: skip
            });

            if (shown) {
                currentIndex = index;
                return;
            }
            index += 1;
        }

        finish(false);
    }

    function start(options) {
        const opts = options || {};
        if (running) return;
        if (!steps.length) return;

        if (spotlight.isModalOpen()) return;

        const urlParam = getUrlTourParam();
        if (urlParam === 'reset') {
            storage.reset();
            stripTourParamFromUrl();
        } else if (urlParam === '1') {
            stripTourParamFromUrl();
        } else if (!opts.force && storage.isCompleted()) {
            return;
        }

        running = true;
        pausedForModal = false;
        currentIndex = 0;
        watchModals();
        dispatch('portal:tour-started');
        showStepAt(0);
    }

    function reset() {
        storage.reset();
    }

    function isCompleted() {
        return storage.isCompleted();
    }

    function initAutoStart() {
        const urlParam = getUrlTourParam();
        if (urlParam === 'reset' || urlParam === '1') {
            start({ force: true });
            return;
        }
        if (tourConfig.autoStart && !storage.isCompleted()) {
            window.requestAnimationFrame(() => start());
        }
    }

    window.PortalTour = {
        start,
        reset,
        isCompleted,
        skip
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupReplayButton();
            initAutoStart();
        });
    } else {
        setupReplayButton();
        initAutoStart();
    }
})();
