/** Шаги мини-экскурсии по порталу. */
window.PortalTourSteps = [
    {
        modal: true,
        title: 'Добро пожаловать на ИТ-портал',
        text: 'Короткий тур покажет, как быстро найти сервис, оформить заявку и использовать персональные действия в профиле.',
        nextLabel: 'Начать',
        hideProgress: true,
        hideBack: true
    },
    {
        selector: '#cardSearch',
        title: 'Поиск по услугам',
        text: 'Введите название услуги или ключевое слово — карточки отфильтруются. Можно использовать горячую клавишу Ctrl+F.',
        placement: 'bottom',
        hideProgress: true
    },
    {
        selector: '#portalAuthUserBtn',
        title: 'Меню профиля',
        text: 'Здесь ваши данные, персональные быстрые действия, переключение темы и выход из портала.',
        placement: 'bottom',
        hideProgress: true
    },
    {
        selector: '#portalAuthMyIssuesBtn',
        title: 'Мои заявки и техника',
        text: 'В меню профиля доступны кнопки «Мои заявки» (Tracker) и «Моя техника» (SMDB) с переходом под вашу учётную запись.',
        placement: 'left',
        hideProgress: true,
        skipScrollIntoView: true,
        prepare: function () {
            document.dispatchEvent(new CustomEvent('portal:auth-menu-open'));
        }
    },
    {
        selector: '#sectionNavChips',
        title: 'Навигация по разделам',
        text: 'Быстрый переход к нужной категории заявок. Активный раздел подсвечивается при прокрутке страницы.',
        placement: 'bottom',
        hideProgress: true,
        prepare: function () {
            document.dispatchEvent(new CustomEvent('portal:auth-menu-close'));
        }
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
