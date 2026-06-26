# Архитектура ИТ-портала 21vek

Статический сайт без bundler: HTML + vanilla JS + CSS. Модули общаются через глобальные объекты на `window` в фиксированном порядке загрузки.

## Порядок скриптов

**`<head>`:** `portal-theme-init.js` (до CSS, против FOUC)

**Конец `<body>`:**
```
config.js → modal.js → form.js → theme.js → nav.js → search-index.js → search.js → cards.js → request-types.js → app.js
```

## Глобальные контракты

| Глобал | Тип | Ключевые поля / методы | Кто создаёт | Кто потребляет |
|--------|-----|------------------------|-------------|----------------|
| `PortalConfig` | object | `trackerQueue`, `twoStepRequestTypes`, `sections`, `usefulLinks`, `externalLinks`, `defaultTheme`, `demoMode` | `js/config.js` | `app.js`, `nav.js`, `theme.js` |
| `PortalRequestTypes` | object | `{ [requestType]: { title, options, defaultOpt } }` | `js/request-types.js` (сборка) | `app.js`, `search-index.js` |
| `PortalSearchIndex` | object | `{ cards: [...] }` — индекс для поиска | `js/search-index.js` (сборка) | `js/search.js` |
| `PortalModal` | namespace | `open(el)`, `close(el)`, `setup(el, opts)` | `js/modal.js` | `app.js` |
| `PortalForm` | namespace | `showError`, `showNotice`, `clearError`, `requireValue`, `showGlobalError` | `js/form.js` | `app.js` |
| `PortalSearch` | namespace | `createMatcher(query)` → `{ matchesCard(card) }` | `js/search.js` | `js/cards.js` |
| `PortalTheme` | namespace | `getTheme()`, `setTheme()`, `toggleTheme()` | `js/theme.js` | опционально внешние интеграции |

## События документа

| Событие | detail | Когда |
|---------|--------|-------|
| `portal:filter-changed` | — | После фильтрации карточек поиском |
| `portal:theme-changed` | `{ theme }` | После смены темы |
| `portal:focus-search` | — | Ctrl/Cmd+F — фокус на поле поиска |

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
