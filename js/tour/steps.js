/** Шаги мини-экскурсии по порталу. */
window.PortalTourSteps = [
    {
        modal: true,
        title: 'Добро пожаловать на ИТ-портал',
        text: 'Краткая экскурсия покажет, как найти нужную услугу и оформить заявку. Это займёт меньше минуты.',
        nextLabel: 'Начать',
        hideProgress: true,
        hideBack: true
    },
    {
        selector: '#cardSearch',
        title: 'Поиск по услугам',
        text: 'Введите название услуги или ключевое слово — карточки отфильтруются. Поддерживаются синонимы и исправление раскладки.',
        placement: 'bottom',
        hideProgress: true
    },
    {
        selector: '#themeToggle',
        title: 'Тема оформления',
        text: 'Переключите светлую или тёмную тему. Выбор сохраняется между визитами.',
        placement: 'bottom',
        hideProgress: true
    },
    {
        selector: '#sectionNavChips',
        title: 'Навигация по разделам',
        text: 'Быстрый переход к нужной категории заявок. Активный раздел подсвечивается при прокрутке страницы.',
        placement: 'bottom',
        hideProgress: true
    },
    {
        selector: '.service-card[data-request-type="tech_support"]',
        title: 'Оформление заявки',
        text: 'Нажмите на карточку услуги — откроется форма заявки. То же работает с клавиатуры: Tab и Enter.',
        placement: 'top',
        hideProgress: true
    },
    {
        selector: '#usefulSection',
        title: 'Полезные ссылки',
        text: 'CMDB, справочник сотрудников и база знаний — внешние ресурсы в одном блоке.',
        placement: 'top',
        hideProgress: true,
        prepare: function () {
            const section = document.querySelector('#usefulSection');
            if (section) {
                section.scrollIntoView({ block: 'center', behavior: 'auto' });
            }
        }
    },
    {
        modal: true,
        title: 'Спасибо!',
        text: 'Теперь вы знаете, как пользоваться порталом. Ждём от вас заявку — мы на связи.',
        nextLabel: 'Закрыть',
        hideProgress: true,
        hideSkip: true
    }
];
