/** Счётчик заявок в подвале. Позже — загрузка total из API Трекера. */
window.PortalRequestStats = (function () {
    const noop = {
        getCount: function () { return null; },
        refresh: function () { return Promise.resolve(null); }
    };

    function getStatsConfig() {
        return (window.PortalConfig && window.PortalConfig.requestStats) || {};
    }

    const cfg = getStatsConfig();
    if (!cfg.enabled) {
        return noop;
    }

    const valueEl = document.getElementById('portalRequestStatsValue');
    const rootEl = document.getElementById('portalRequestStats');
    if (!valueEl || !rootEl) {
        return noop;
    }

    const storageKey = cfg.localStorageKey || 'portal-request-count-local';
    const seedCount = Number(cfg.seedCount) >= 0 ? Number(cfg.seedCount) : 0;

    let apiTotal = null;
    let localDelta = readLocalDelta();

    function readLocalDelta() {
        try {
            const raw = window.localStorage.getItem(storageKey);
            const parsed = parseInt(raw, 10);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } catch (error) {
            return 0;
        }
    }

    function writeLocalDelta(value) {
        try {
            window.localStorage.setItem(storageKey, String(value));
        } catch (error) {
            // ignore blocked storage
        }
    }

    function formatCount(value) {
        return new Intl.NumberFormat('ru-RU').format(value);
    }

    function getCount() {
        if (apiTotal !== null) {
            return apiTotal;
        }
        return seedCount + localDelta;
    }

    function render() {
        const count = getCount();
        valueEl.textContent = formatCount(count);
        rootEl.setAttribute('aria-label', `Заявок через портал: ${formatCount(count)}`);
    }

    function incrementLocal() {
        localDelta += 1;
        writeLocalDelta(localDelta);
        render();
    }

    function parseApiTotal(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const candidates = [payload.total, payload.count, payload.issuesCount];
        for (let i = 0; i < candidates.length; i += 1) {
            const value = Number(candidates[i]);
            if (Number.isFinite(value) && value >= 0) {
                return value;
            }
        }
        return null;
    }

    async function refresh() {
        const apiUrl = cfg.apiUrl;
        if (!apiUrl) {
            return getCount();
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) {
                return getCount();
            }
            const data = await response.json();
            const total = parseApiTotal(data);
            if (total !== null) {
                apiTotal = total;
                render();
            }
        } catch (error) {
            // API недоступен — остаёмся на seed + local
        }

        return getCount();
    }

    function onTaskSubmitted() {
        if (apiTotal !== null) {
            apiTotal += 1;
        } else {
            incrementLocal();
        }
        render();
    }

    function init() {
        rootEl.classList.remove('hidden');
        render();
        refresh();
        document.addEventListener('portal:task-submitted', onTaskSubmitted);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        getCount,
        refresh
    };
})();
