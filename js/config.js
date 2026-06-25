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
    usefulLinks: {
        cmdb: 'https://cmdb.company.ru',
        phonebook: 'https://phonebook.company.ru',
        knowledge: 'https://wiki.company.ru'
    },
    themeStorageKey: 'portal-theme',
    defaultTheme: 'light',
    demoMode: true
};
