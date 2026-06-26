/** Шаги мини-экскурсии по порталу. */
window.PortalTourSteps = [
    {
        selector: '#cardSearch',
        title: 'Поиск по услугам',
        text: 'Введите название услуги или ключевое слово — карточки отфильтруются. Поддерживаются синонимы и исправление раскладки.',
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
        selector: '#themeToggle',
        title: 'Тема оформления',
        text: 'Переключите светлую или тёмную тему. Выбор сохраняется между визитами.',
        placement: 'bottom'
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
    },
    {
        selector: '#scrollToTopBtn',
        title: 'Кнопка «Наверх»',
        text: 'Появляется при прокрутке вниз — быстро вернёт к началу страницы.',
        placement: 'top',
        skipScrollIntoView: true,
        prepare: function () {
            window.scrollTo({ top: 400, behavior: 'auto' });
            const btn = document.getElementById('scrollToTopBtn');
            if (btn) {
                btn.classList.add('is-visible');
                btn.setAttribute('aria-hidden', 'false');
                btn.tabIndex = 0;
            }
        }
    }
];
