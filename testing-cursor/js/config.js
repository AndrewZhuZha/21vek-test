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
    demoMode: true
};
