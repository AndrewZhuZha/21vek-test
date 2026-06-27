# Архитектура ИТ-портала 21vek

Статический сайт без bundler: HTML + vanilla JS + CSS. Модули общаются через глобальные объекты на `window` в фиксированном порядке загрузки.

## Порядок скриптов

**`<head>` (до CSS):** `portal-search-hotkey.js`, `portal-theme-init.js`

**Конец `<body>`:**
```
config.js → config.local.js → auth/index.js → auth/gate.js → auth/ui.js → modal.js → form.js → tracker.js → theme.js → nav.js → search-index.js → search.js → cards.js → request-types.js → app.js → request-stats.js → tour/storage.js → tour/steps.js → tour/spotlight.js → tour/index.js
```

## Глобальные контракты

| Глобал | Тип | Ключевые поля / методы | Кто создаёт | Кто потребляет |
|--------|-----|------------------------|-------------|----------------|
| `PortalConfig` | object | `trackerQueue`, `trackerApiUrl`, `demoMode`, `sections`, `usefulLinks`, … | `js/config.js` + `js/config.local.js` | `app.js`, `nav.js`, `theme.js`, `tracker.js` |
| `PortalRequestTypes` | object | `{ [requestType]: { title, options, defaultOpt } }` | `js/request-types.js` (сборка) | `app.js`, `search-index.js` |
| `PortalSearchIndex` | object | `{ cards: [...] }` — индекс для поиска | `js/search-index.js` (сборка) | `js/search.js` |
| `PortalModal` | namespace | `open(el)`, `close(el)`, `setup(el, opts)` | `js/modal.js` | `app.js` |
| `PortalForm` | namespace | `showError`, `showNotice`, `clearError`, `requireValue`, `showGlobalError` | `js/form.js` | `app.js` |
| `PortalTracker` | namespace | `submitToTracker`, `submitPasswordReset`, `setButtonLoading`, … | `js/tracker.js` | `app.js` |
| `PortalSearch` | namespace | `createMatcher(query)` → `{ matchesCard(card) }` | `js/search.js` | `js/cards.js` |
| `PortalTheme` | namespace | `getTheme()`, `setTheme()`, `toggleTheme()` | `js/theme.js` | опционально внешние интеграции |
| `PortalRequestStats` | namespace | `getCount()`, `refresh()` | `js/request-stats.js` | подвал; слушает `portal:task-submitted` |
| `PortalTour` | namespace | `start(opts)`, `reset()`, `isCompleted()`, `skip()` | `js/tour/index.js` | опционально внешние интеграции |
| `PortalTourStorage` | namespace | `isCompleted()`, `markCompleted()`, `reset()` | `js/tour/storage.js` | `js/tour/index.js` |
| `PortalAuth` | namespace | `init()`, `whenReady()`, `getUser()`, `login()`, `logout()`, `isAuthenticated()` | `js/auth/index.js` | `js/app.js`, `js/auth/gate.js`, `js/auth/ui.js` |

## Конфигурация среды

Базовые значения — [js/config.js](../js/config.js). Переопределения для prod/stage — [js/config.local.js](../js/config.local.js) (шаблон полей: [js/config.local.example.js](../js/config.local.example.js)).

```javascript
window.PortalConfigLocal = {
    demoMode: false,
    trackerApiUrl: '/api/tracker/issues',
    usefulLinks: { phonebook: 'https://...' }
};
```

После `config.local.js` срабатывает merge в `config.js` (в т.ч. глубокий merge для `usefulLinks`, `externalLinks`, `tour`, `requestStats`, `auth`).

### Мини-экскурсия (`tour`)

Флаги в `PortalConfig.tour` ([js/config.js](../js/config.js)):

| Поле | По умолчанию | Назначение |
|------|--------------|------------|
| `enabled` | `true` | Главный выключатель модуля |
| `storageKey` | `'portal-tour-v1'` | Ключ localStorage; смена версии перезапускает тур |
| `autoStart` | `true` | Автозапуск при первом визите |
| `showReplayButton` | `true` | Кнопка «Тур» в шапке (`#tourReplayBtn`) |
| `replayButtonSelector` | `'#tourReplayBtn'` | Селектор кнопки повторного показа |

Шаги тура — [js/tour/steps.js](../js/tour/steps.js). Стили — [css/tour.css](../css/tour.css).

Отключение на среде: `tour: { enabled: false }` в `config.local.js`.

QA: `?tour=1` — принудительный старт; `?tour=reset` — сброс storage и старт.

При `enabled: false` скрипты загружаются, но `PortalTour` — no-op.

### Счётчик заявок (`requestStats`)

Флаги в `PortalConfig.requestStats` ([js/config.js](../js/config.js)):

| Поле | По умолчанию | Назначение |
|------|--------------|------------|
| `enabled` | `true` | Показ счётчика в подвале |
| `apiUrl` | `''` | GET total с backend (`{ total \| count \| issuesCount }`) |
| `localStorageKey` | `'portal-request-count-local'` | Локальный инкремент после submit |
| `seedCount` | `0` | Начальное значение |

### Авторизация Yandex 360 (`auth`)

Флаги в `PortalConfig.auth` ([js/config.js](../js/config.js)). Backend: [backend/](../backend/), инструкция: [AUTH-SETUP.md](AUTH-SETUP.md).

| Поле | По умолчанию | Назначение |
|------|--------------|------------|
| `enabled` | `true` | Главный выключатель модуля |
| `requireAuth` | `true` | Gate: портал недоступен без входа |
| `autoFillFio` | `true` | Подстановка ФИО в формы из профиля |
| `loginUrl` | `'/api/auth/login'` | Redirect на Yandex OAuth |
| `logoutUrl` | `'/api/auth/logout'` | POST выход |
| `userInfoUrl` | `'/api/auth/me'` | GET профиль или 401 |

При `enabled: false` — `PortalAuth` no-op, поведение как до модуля auth.

## События документа

| Событие | detail | Когда |
|---------|--------|-------|
| `portal:filter-changed` | — | После фильтрации карточек поиском |
| `portal:theme-changed` | `{ theme }` | После смены темы |
| `portal:focus-search` | — | Ctrl/Cmd+F или `/` — фокус на поле поиска |
| `portal:scroll-to-top` | — | Прокрутка наверх (кнопка или заголовок) |
| `portal:task-submitted` | `{ issueKey?, requestType, demo? }` | Успешная отправка заявки |
| `portal:task-failed` | `{ error, requestType }` | Ошибка отправки заявки |
| `portal:tour-started` | — | Начало мини-экскурсии |
| `portal:tour-completed` | — | Тур завершён до последнего шага |
| `portal:tour-skipped` | — | Тур пропущен (Esc / «Пропустить») |
| `portal:auth-ready` | `{ user }` | Сессия проверена; user может быть null |
| `portal:auth-required` | — | Не авторизован при `requireAuth: true` |
| `portal:auth-logout` | — | После logout (до reload) |

## Добавление новой услуги

1. `<button class="service-card" data-request-type="...">` в `index.html`
2. Запись в `data/request-types.json`
3. При необходимости — ключевые слова в `data/search.overrides.json`
4. `npm run build:search` (или `node scripts/build-search-index.mjs`)
5. Проверка: клик/Enter → форма; поиск по названию и синонимам

Сборка валидирует соответствие HTML и JSON — при расхождении завершается с кодом 1.

## Сборка

```bash
npm run build:search   # search-index.js + request-types.js
npm run build:errors   # errors/*.html
npm run build          # оба скрипта
```

Без npm-зависимостей — достаточно Node.js 18+.
