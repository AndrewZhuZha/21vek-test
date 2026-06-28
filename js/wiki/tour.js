/** Мини-экскурсия по встроенной Wiki (spotlight, как на портале). */
(function () {
    const noopApi = {
        start: function () {},
        reset: function () {},
        isCompleted: function () { return true; },
        skip: function () {}
    };

    const tourConfig = window.PortalConfig?.wiki?.tour;
    if (!tourConfig || !tourConfig.enabled) {
        window.PortalWikiTour = noopApi;
        return;
    }

    const spotlight = window.PortalTourSpotlight;
    if (!spotlight) {
        window.PortalWikiTour = noopApi;
        return;
    }

    const storageKey = tourConfig.storageKey || 'portal.wiki.tour.completed.v1';

    const steps = [
        {
            modal: true,
            hideBack: true,
            title: 'Добро пожаловать в базу знаний',
            text: 'Краткий тур покажет, как искать инструкции, листать разделы и открывать оригинал статьи в Yandex Wiki.',
            nextLabel: 'Начать'
        },
        {
            selector: '#wikiSearchField',
            placement: 'bottom',
            title: 'Поиск по базе знаний',
            text: 'Ищите инструкции по названию или ключевым словам — так же, как на главном портале.'
        },
        {
            selector: '#wikiSidebarPanel',
            placement: 'right',
            title: 'Разделы и подстраницы',
            text: 'Слева — структура Wiki. Нажмите ▾, чтобы свернуть или раскрыть подраздел.'
        },
        {
            selector: '#wikiBreadcrumbs',
            placement: 'bottom',
            title: 'Навигация по пути',
            text: 'Хлебные крошки показывают, где вы находитесь внутри раздела. Можно перейти на уровень выше.'
        },
        {
            selector: '#wikiPageContent',
            placement: 'top',
            title: 'Содержимое статьи',
            text: 'Текст, предупреждения и скриншоты отображаются здесь. Изображения подгружаются с индикатором загрузки.'
        },
        {
            selector: '#wikiOpenLink',
            placement: 'left',
            title: 'Открыть в Wiki',
            text: 'Если нужен оригинал статьи в Yandex Wiki — откройте её по этой кнопке.'
        }
    ];

    let currentIndex = -1;
    let running = false;

    function readState() {
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch {
            // ignore
        }
        return null;
    }

    function writeState(state) {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
            // ignore
        }
    }

    function isCompleted() {
        const state = readState();
        if (state && typeof state === 'object' && 'completed' in state) {
            return Boolean(state.completed);
        }
        return state === '1' || state === 1;
    }

    function markCompleted() {
        writeState({
            completed: true,
            at: new Date().toISOString().slice(0, 10)
        });
    }

    function reset() {
        try {
            window.localStorage.removeItem(storageKey);
        } catch {
            // ignore
        }
    }

    function stopRunning() {
        if (!running) return;
        spotlight.teardown();
        running = false;
        currentIndex = -1;
    }

    function finish(skipped) {
        running = false;
        currentIndex = -1;
        spotlight.teardown();
        markCompleted();
        document.dispatchEvent(new CustomEvent(skipped ? 'portal:wiki-tour-skipped' : 'portal:wiki-tour-completed'));
    }

    function skip() {
        if (!running) return;
        finish(true);
    }

    function showStepAt(index) {
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
        if (running) {
            if (!opts.force) return;
            stopRunning();
        }
        if (!steps.length) return;
        if (!opts.force && isCompleted()) {
            return;
        }

        running = true;
        currentIndex = 0;
        showStepAt(0);
    }

    function setupReplayButton() {
        const selector = tourConfig.replayButtonSelector || '#wikiTourReplayBtn';
        const button = document.querySelector(selector);
        if (!button) return;

        if (!tourConfig.showReplayButton) {
            button.classList.add('hidden');
            return;
        }

        button.classList.remove('hidden');
        if (tourConfig.replayButtonLabel) {
            button.textContent = tourConfig.replayButtonLabel;
        }
        button.addEventListener('click', () => {
            stopRunning();
            reset();
            start({ force: true });
        });
    }

    window.PortalWikiTour = {
        start,
        reset,
        isCompleted,
        skip
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupReplayButton);
    } else {
        setupReplayButton();
    }
})();
