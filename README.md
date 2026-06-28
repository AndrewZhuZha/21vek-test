# ИТ-портал 21vek

Корпоративная стартовая страница: карточки услуг, заявки в Яндекс Трекер (очередь ITHELP), поиск, сброс пароля, вход через Yandex 360 (@21vek.by).

Статический фронтенд + Node.js backend для OAuth. Секреты — только в `backend/.env`.

## Быстрый старт

```bash
npm install
npm run setup:auth          # создаёт backend/.env — заполните YANDEX_CLIENT_ID и SECRET
npm run refresh:wiki-search # sync + build + validate wiki artifacts
npm start                   # http://localhost:3000
```

Подробнее: [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md).

Без backend (только UI): `js/config.local.js` с `auth: { enabled: false }`.

## Сборка и проверки

```bash
npm run build               # search-index + error pages
npm run verify:prod         # build + API smoke
npm run verify:wiki         # smoke wiki reader/config (для wiki-enabled среды)
npm run verify:a11y         # axe (нужен Chrome/Chromium)
npm run audit:deps
```

После правок `data/request-types.json` или `data/search.overrides.json` — `npm run build:search`.

## Настройка

| Файл | Назначение |
|------|------------|
| [js/config.js](js/config.js) | Базовый конфиг |
| [js/config.local.js](js/config.local.js) | Переопределения среды (шаблон: [config.local.example.js](js/config.local.example.js)) |
| [backend/.env](backend/.env.example) | OAuth, сессии, Tracker demo-режим |

Новая услуга: карточка в `index.html` → запись в `data/request-types.json` → `npm run build:search`.

`TRACKER_DEMO_MODE=true` (по умолчанию): API возвращает тестовый `issueKey` без отправки в prod Tracker.

## Документация

- [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) — OAuth Yandex 360
- [docs/WIKI-SETUP.md](docs/WIKI-SETUP.md) — встроенный wiki reader + cron-синхронизация
- [docs/DEPLOY.md](docs/DEPLOY.md) — production: Docker, nginx, безопасность
- [docs/SCALE-3000.md](docs/SCALE-3000.md) — масштабирование до 3000 пользователей
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — модули и добавление услуг
- [docs/SMOKE-TESTS.md](docs/SMOKE-TESTS.md) — чек-лист перед релизом
- [errors/DEPLOY.md](errors/DEPLOY.md) — привязка страниц ошибок в nginx/IIS

itsupport@21vek.by · © IT Support 21vek
