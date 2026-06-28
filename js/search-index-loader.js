/** Ленивая загрузка search-index.js (~1000+ строк) после idle или первого поиска. */
window.PortalSearchIndexLoader = (function () {
    let loadPromise = null;

    function isLoaded() {
        return Boolean(window.__portalSearchIndexLoaded);
    }

    function load() {
        if (isLoaded()) {
            return Promise.resolve(window.PortalSearchIndex || {});
        }
        if (loadPromise) {
            return loadPromise;
        }
        loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/js/search-index.js';
            script.async = true;
            script.onload = () => {
                window.__portalSearchIndexLoaded = true;
                resolve(window.PortalSearchIndex || {});
            };
            script.onerror = () => {
                loadPromise = null;
                reject(new Error('Не удалось загрузить индекс поиска'));
            };
            document.head.appendChild(script);
        });
        return loadPromise;
    }

    function scheduleIdleLoad() {
        const run = () => {
            load().catch(() => {});
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 2500 });
        } else {
            window.setTimeout(run, 1200);
        }
    }

    return { load, scheduleIdleLoad, isLoaded };
})();
