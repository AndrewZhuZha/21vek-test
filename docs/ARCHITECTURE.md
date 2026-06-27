# Архитектура

Статический сайт: HTML + vanilla JS + CSS, без bundler. Модули — глобалы на `window`.

## Порядок скриптов

**`<head>`:** `portal-search-hotkey.js`, `portal-theme-init.js`

**Конец `<body>`:**
```
config.js → config.local.js → auth/* → modal.js → form.js → tracker.js →
theme.js → nav.js → search-index.js → search.js → cards.js → request-types.js →
app.js → request-stats.js → tour/* 
```

## Ключевые модули

| Глобал | Назначение |
|--------|------------|
| `PortalConfig` | Конфиг ([js/config.js](../js/config.js) + local) |
| `PortalRequestTypes` | Типы заявок (сборка из JSON) |
| `PortalSearchIndex` | Индекс поиска (сборка) |
| `PortalAuth` | OAuth gate, login/logout |
| `PortalTracker` | Отправка заявок в backend |
| `PortalModal`, `PortalForm` | Модалки и валидация |

Конфиг среды: [js/config.local.example.js](../js/config.local.example.js). OAuth: [AUTH-SETUP.md](AUTH-SETUP.md).

## События

| Событие | Когда |
|---------|-------|
| `portal:task-submitted` | Успешная заявка |
| `portal:auth-ready` | Сессия проверена |
| `portal:theme-changed` | Смена темы |
| `portal:filter-changed` | Поиск отфильтровал карточки |

## Новая услуга

1. `<button class="service-card" data-request-type="...">` в `index.html`
2. Запись в `data/request-types.json`
3. При необходимости — `data/search.overrides.json`
4. `npm run build:search`

Сборка проверяет соответствие HTML и JSON.
