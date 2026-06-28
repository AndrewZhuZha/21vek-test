# Локальная разработка

## Требования

- **Node.js 20+**
- **npm** (корневой `package.json` + `postinstall` для backend)
- Для a11y-тестов: Chrome/Chromium
- Для loadtest: [k6](https://k6.io/)

## Быстрый старт

```bash
npm install
npm run setup:auth          # создаёт backend/.env
# заполните YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, SESSION_SECRET
npm run refresh:wiki-search # опционально, если Wiki включена
npm start                   # http://localhost:3000
```

Hot reload: `npm run dev` (`node --watch`).

Без backend (только UI): создайте `js/config.local.js`:

```javascript
window.PortalConfigLocal = { auth: { enabled: false } };
```

Шаблон: [`js/config.local.example.js`](../js/config.local.example.js).

## Конфигурация

| Файл | Назначение |
|------|------------|
| [`backend/.env`](../backend/.env.example) | OAuth, сессии, Wiki, Tracker, rate limits |
| [`js/config.js`](../js/config.js) | Публичный фронтенд-конфиг |
| [`js/config.local.js`](../js/config.local.js) | Локальные переопределения (gitignored) |

OAuth: [guides/AUTH-SETUP.md](guides/AUTH-SETUP.md). Wiki: [guides/WIKI-SETUP.md](guides/WIKI-SETUP.md).

## npm-скрипты

### Сборка

| Скрипт | Действие |
|--------|----------|
| `npm run build` | search-index + error pages + CSS bundles |
| `npm run build:search` | `data/*` → `js/search-index.js` |
| `npm run build:errors` | `errors/*.html` assets |
| `npm run build:css` | `portal.bundle.css`, `wiki.bundle.css` |

После правок `data/request-types.json` или `data/search.overrides.json` — `npm run build:search`.

### Wiki

| Скрипт | Действие |
|--------|----------|
| `npm run sync:wiki` | Обновить `data/wiki-search.json` |
| `npm run refresh:wiki-search` | sync + build:search + validate |
| `npm run warm:wiki-cache` | Прогреть Wiki page cache (нужен service token) |

### Проверки

| Скрипт | Действие |
|--------|----------|
| `npm run test:backend` | Unit-тесты (19 тестов) |
| `npm run verify:auth` | HTTP smoke (45 checks) |
| `npm run verify:wiki` | Wiki smoke (`WIKI_EXPECT_ENABLED=true/false`) |
| `npm run verify:a11y` | axe на `/` и `/wiki/` |
| `npm run verify:prod` | build + verify:auth |
| `npm run verify:security` | test:backend + verify:auth |
| `npm run audit:wiki-parser` | Синтетический аудит Wiki-парсера |
| `npm run audit:deps` | npm audit (root + backend) |

Подробнее: [TESTING.md](TESTING.md).

### Loadtest

| Скрипт | Действие |
|--------|----------|
| `npm run loadtest:static` | k6 — статика |
| `npm run loadtest:api` | k6 — API без сессии |
| `npm run loadtest:wiki` | k6 — Wiki (нужна cookie) |
| `npm run loadtest:smoke` | Быстрый autocannon smoke |
| `npm run loadtest:heavy` | Тяжёлый сценарий (3000 VU) |

См. [`scripts/loadtest/README.md`](../scripts/loadtest/README.md).

## Добавление новой услуги

1. Кнопка в [`index.html`](../index.html): `data-request-type="..."`.
2. Запись в [`data/request-types.json`](../data/request-types.json).
3. При необходимости — синонимы в [`data/search.overrides.json`](../data/search.overrides.json).
4. `npm run build:search` — сборка проверяет соответствие HTML и JSON.

## Generated artifacts в git

Следующие файлы **генерируются скриптами**, но **коммитятся** намеренно:

- `js/search-index.js`
- `css/portal.bundle.css`, `css/wiki.bundle.css`
- `errors/400.html` … `504.html`
- `data/wiki-search.json`

Причина: Docker-образ собирается без повторного вызова Wiki API на CI; deploy остаётся воспроизводимым. После изменения данных или Wiki — запустите `npm run build` / `refresh:wiki-search` и закоммитьте артефакты.

## Backend dev-скрипты

| Скрипт | Назначение |
|--------|------------|
| `backend/scripts/wiki-verify.mjs` | `audit:wiki-parser` |
| `backend/scripts/wiki-audit.mjs` | CLI полный аудит страниц |
| `backend/scripts/wiki-probe.mjs` | Точечный probe страницы/asset |

Wiki QA: [guides/WIKI-QA.md](guides/WIKI-QA.md).

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| `redirect_uri does not match` | Redirect URI = `{PUBLIC_URL}/api/auth/callback` |
| `403 CSRF` | `PUBLIC_URL` совпадает с URL в браузере |
| `fetch failed` (корп. прокси) | `YANDEX_OAUTH_TLS_INSECURE=true` или `NODE_EXTRA_CA_CERTS` |
| Wiki 401 | Re-login после добавления scope `wiki:read` |
| `verify:wiki` fail (empty index) | `npm run refresh:wiki-search` |

Эксплуатация и cron: [OPERATIONS.md](OPERATIONS.md).
