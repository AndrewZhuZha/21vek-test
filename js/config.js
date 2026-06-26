/** Центральная конфигурация портала (без секретов). */
window.PortalConfig = {
    trackerQueue: 'ITHELP',
    /** Типы заявок с двухшаговым мастером (шаг 1 → шаг 2 → отправка). */
    twoStepRequestTypes: ['hr_new'],
    sections: [
        { id: 'section-support', label: 'Техподдержка', icon: '🆘' },
        { id: 'section-equipment', label: 'Оборудование', icon: '💻' },
        { id: 'section-hr', label: 'HR', icon: '👥' },
        { id: 'section-servers', label: 'Серверы и сеть', icon: '🌐' },
        { id: 'section-skud', label: 'СКУД', icon: '📹' },
        { id: 'section-printers', label: 'Принтеры', icon: '🖨️' },
        { id: 'section-other', label: 'Другие', icon: '📌' },
        { id: 'usefulSection', label: 'Полезное', icon: '🎯' }
    ],
    supportEmail: 'itsupport@21vek.by',
    portalTagline: 'IT-Support · 21VEK',
    externalLinks: {
        wiki: 'https://wiki.yandex.ru/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/',
        learning: 'https://wiki.yandex.ru/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/',
        smdb: 'http://snipeit-tb.triovist.local/'
    },
    usefulLinks: {
        cmdb: 'http://snipeit-tb.triovist.local/',
        phonebook: 'https://phonebook.company.ru',
        knowledge: 'https://wiki.yandex.ru/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/'
    },
    themeStorageKey: 'portal-theme',
    themeTransitionMs: 140,
    defaultTheme: 'system',
    demoMode: true,
    /** POST endpoint backend-прокси для создания задач в Трекере. */
    trackerApiUrl: '/api/tracker/issues',
    /** Endpoint сброса пароля; по умолчанию trackerApiUrl. */
    trackerResetApiUrl: '/api/tracker/password-reset',
    /** Шаблон ссылки на задачу после успеха. Плейсхолдер: {issueKey} */
    trackerIssueUrlTemplate: 'https://tracker.yandex.ru/{issueKey}',
    /** Блокировка повторной отправки после submit, мс. */
    submitCooldownMs: 2500,
    /** Мини-экскурсия по порталу (js/tour/). */
    tour: {
        enabled: true,
        storageKey: 'portal-tour-v1',
        showReplayButton: true,
        autoStart: true,
        replayButtonSelector: '#tourReplayBtn',
        replayButtonLabel: 'Показать тур'
    }
};

(function mergeLocalPortalConfig() {
    if (window.PortalConfigLocal && typeof window.PortalConfigLocal === 'object') {
        Object.assign(window.PortalConfig, window.PortalConfigLocal);
        if (window.PortalConfigLocal.usefulLinks) {
            window.PortalConfig.usefulLinks = {
                ...window.PortalConfig.usefulLinks,
                ...window.PortalConfigLocal.usefulLinks
            };
        }
        if (window.PortalConfigLocal.externalLinks) {
            window.PortalConfig.externalLinks = {
                ...window.PortalConfig.externalLinks,
                ...window.PortalConfigLocal.externalLinks
            };
        }
        if (window.PortalConfigLocal.tour) {
            window.PortalConfig.tour = {
                ...window.PortalConfig.tour,
                ...window.PortalConfigLocal.tour
            };
        }
    }
})();
