/** Шаги мини-экскурсии по порталу. */
window.PortalTourSteps = [
    {
        selector: '#cardSearch',
        title: 'Поиск по услугам',
        text: 'Введите название услуги или ключевое слово — карточки отфильтруются. Поддерживаются синонимы и исправление раскладки.',
        placement: 'bottom'
    },
    {
        selector: '#themeToggle',
        title: 'Тема оформления',
        text: 'Переключите светлую или тёмную тему. Выбор сохраняется между визитами.',
        placement: 'bottom'
    },
    {
        selector: '#sectionNavChips',
        title: 'Навигация по разделам',
        text: 'Быстрый переход к нужной категории заявок. Активный раздел подсвечивается при прокрутке страницы.',
        placement: 'bottom'
    },
    {
        selector: '.service-card[data-request-type="tech_support"]',
        title: 'Оформление заявки',
        text: 'Нажмите на карточку услуги — откроется форма заявки. То же работает с клавиатуры: Tab и Enter.',
        placement: 'top'
    },
    {
        selector: '#usefulSection',
        title: 'Полезные ссылки',
        text: 'CMDB, справочник сотрудников и база знаний — внешние ресурсы в одном блоке.',
        placement: 'top',
        prepare: function () {
            const section = document.querySelector('#usefulSection');
            if (section) {
                section.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }
    }
];
