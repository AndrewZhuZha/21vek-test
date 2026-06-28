/** Переключение wiki/learning ссылок между встроенным reader и внешним Yandex Wiki. */
window.PortalAppWikiLinks = (function () {
    function isInternalPortalUrl(rawUrl) {
        const value = String(rawUrl || '').trim();
        if (!value) return false;
        try {
            const parsed = new URL(value, window.location.origin);
            return parsed.origin === window.location.origin;
        } catch {
            return value.startsWith('/');
        }
    }

    function applyPortalLinkHref(link, url) {
        if (!link || !url) return;
        link.setAttribute('href', url);
        if (isInternalPortalUrl(url)) {
            link.removeAttribute('target');
            link.removeAttribute('rel');
            return;
        }
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    }

    function openPortalUrl(rawUrl) {
        const url = String(rawUrl || '').trim();
        if (!url) return;
        if (isInternalPortalUrl(url)) {
            window.location.href = url;
            return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    /**
     * @param {object} options
     * @param {object} options.config
     * @param {Record<string, HTMLAnchorElement>} options.portalLinks
     * @param {object} options.runtimeLinks
     */
    function init({ config, portalLinks, runtimeLinks }) {
        const wikiConfig = config.wiki || {};
        const wikiRouteUrl = String(wikiConfig.routeUrl || '/wiki/').trim() || '/wiki/';
        const wikiExternalUrl = String(wikiConfig.externalUrl || runtimeLinks.external?.wiki || '').trim();
        let wikiModeRevision = 0;

        function syncWikiLearningLinkVisibility() {
            const wikiUrl = String(runtimeLinks.external?.wiki || '').trim();
            const learningUrl = String(runtimeLinks.external?.learning || '').trim();
            if (!portalLinks.learning) return;
            const hideLearning = Boolean(wikiUrl && learningUrl && wikiUrl === learningUrl);
            portalLinks.learning.hidden = hideLearning;
            portalLinks.learning.setAttribute('aria-hidden', String(hideLearning));
        }

        function applyWikiMode(useInternalLinks, fallbackExternalUrl, revision) {
            if (revision !== undefined && revision !== wikiModeRevision) {
                return;
            }
            const wikiTargetUrl = useInternalLinks
                ? wikiRouteUrl
                : (fallbackExternalUrl || wikiExternalUrl || wikiRouteUrl);
            const knowledgeTargetUrl = useInternalLinks
                ? wikiRouteUrl
                : (fallbackExternalUrl || wikiExternalUrl || wikiRouteUrl);

            runtimeLinks.external.wiki = wikiTargetUrl;
            runtimeLinks.external.learning = wikiTargetUrl;
            runtimeLinks.useful.knowledge = knowledgeTargetUrl;
            runtimeLinks.useful.phonebook = knowledgeTargetUrl;

            applyPortalLinkHref(portalLinks.wiki, runtimeLinks.external.wiki);
            applyPortalLinkHref(portalLinks.learning, runtimeLinks.external.learning);
            syncWikiLearningLinkVisibility();
        }

        syncWikiLearningLinkVisibility();

        const defaultInternalMode = String(runtimeLinks.external?.wiki || '').trim() === wikiRouteUrl;
        const defaultExternalFallback = wikiExternalUrl;
        wikiModeRevision += 1;
        const currentRevision = wikiModeRevision;

        fetch('/api/wiki/config-check', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        })
            .then(async (response) => {
                if (!response.ok) {
                    applyWikiMode(defaultInternalMode, defaultExternalFallback, currentRevision);
                    return;
                }
                const wikiState = await response.json();
                const useInternal = Boolean(wikiState?.enabled && wikiState?.configured);
                const fallbackUrl = String(wikiState?.externalUrl || '').trim();
                applyWikiMode(useInternal, fallbackUrl || defaultExternalFallback, currentRevision);
                if (!useInternal && fallbackUrl && window.PortalForm?.showGlobalNotice) {
                    window.PortalForm.showGlobalNotice('Встроенная Wiki недоступна — ссылки ведут на внешний Yandex Wiki.');
                }
            })
            .catch(() => {
                applyWikiMode(defaultInternalMode, defaultExternalFallback, currentRevision);
            });

        return { applyPortalLinkHref, isInternalPortalUrl, openPortalUrl };
    }

    return { init };
})();
