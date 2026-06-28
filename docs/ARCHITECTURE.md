# Архитектура

Статический сайт: HTML + vanilla JS + CSS, без bundler. Модули — глобалы на `window`.

## Порядок скриптов

**`<head>`:** `portal-search-hotkey.js`, `portal-theme-init.js`, `portal.bundle.css` (prod)

**Конец `<body>`:**
```
config.js → config.local.js → auth/errors.js → auth/* → modal.js → form.js → tracker.js →
theme.js → nav.js → search-index-loader.js → search.js → cards.js → request-types.js →
app/wiki-links.js → app/hr-wizard.js → app.js → request-stats.js → tour/*
```

**Страница `/wiki/` (`wiki.html`):**
```
config.js → config.local.js → auth/errors.js → auth/* → theme.js → wiki/api.js → wiki/tour.js → wiki/reader.js
```

## CSRF

Mutating endpoints (`POST /api/auth/logout`, `POST /api/tracker/*`) защищены проверкой `Origin`/`Referer` против `PUBLIC_URL` ([backend/src/middleware/csrf.js](../backend/src/middleware/csrf.js)). Wiki routes — только GET. Synchronizer tokens не используются: same-origin SPA + `SameSite=Lax` cookie.

## Ключевые модули

| Глобал | Назначение |
|--------|------------|
| `PortalConfig` | Конфиг ([js/config.js](../js/config.js) + local) |
| `PortalRequestTypes` | Типы заявок (сборка из JSON) |
| `PortalSearchIndex` | Индекс поиска (сборка) |
| `PortalAuth` | OAuth gate, login/logout |
| `PortalTracker` | Отправка заявок в backend |
| `PortalModal`, `PortalForm` | Модалки и валидация |
| `PortalWikiApi` | Клиент `/api/wiki/*` для wiki reader |

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

## Wiki reader

- Роут `/wiki/` отдаёт `wiki.html`.
- Backend proxy: `/api/wiki/tree`, `/api/wiki/page`, `/api/wiki/search`.
- Scope-guard: `/api/wiki/page` разрешает только `baseSlug` и descendants (выход за scope = `403`).
- HTML санитизируется на backend (`sanitize-html`, allowlist) и повторно проверяется на frontend (defense-in-depth).
- `/api/wiki/config-check` и `/api/health` содержат diagnostics: `enabled/configured`, snapshot `count/age`, cache degraded mode.
- Кнопка «Редактировать в Wiki» всегда ведёт на `wiki.yandex.ru`.
- Индекс для подсказок на главной: `data/wiki-search.json` → `npm run refresh:wiki-search` (sync + build + validate).
