# ИТ-портал 21vek

Корпоративная стартовая страница: карточки услуг, заявки в Яндекс Трекер (очередь ITHELP, demo), поиск, сброс пароля, вход через Yandex 360 (@21vek.by), встроенный Wiki reader.

Статический фронтенд + Node.js backend для OAuth. Секреты — только в `backend/.env`.

## Быстрый старт

```bash
npm install
npm run setup:auth          # создаёт backend/.env — заполните YANDEX_CLIENT_ID и SECRET
npm run refresh:wiki-search # sync + build wiki (если Wiki включена)
npm start                   # http://localhost:3000
```

Подробнее: [docs/guides/AUTH-SETUP.md](docs/guides/AUTH-SETUP.md).

Без backend (только UI): `js/config.local.js` с `auth: { enabled: false }`.

## Сборка и проверки

```bash
npm run build
npm run verify:security     # unit-тесты + auth smoke
npm run verify:wiki         # wiki smoke (wiki-enabled среда)
npm run verify:a11y         # axe (нужен Chrome/Chromium)
npm run audit:deps
```

После правок `data/request-types.json` — `npm run build:search`.

## Настройка

| Файл | Назначение |
|------|------------|
| [js/config.js](js/config.js) | Базовый конфиг |
| [js/config.local.js](js/config.local.example.js) | Переопределения среды (шаблон) |
| [backend/.env](backend/.env.example) | OAuth, сессии, Wiki, Tracker |

Новая услуга: карточка в `index.html` → `data/request-types.json` → `npm run build:search`.

`TRACKER_DEMO_MODE=true` (по умолчанию): API возвращает тестовый `issueKey` без отправки в prod Tracker. Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).

## Документация

Полный указатель: [docs/README.md](docs/README.md).

| Документ | Тема |
|----------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура системы |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Локальная разработка |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Production deploy |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Cron, мониторинг, troubleshooting |
| [docs/SCALE.md](docs/SCALE.md) | Масштабирование до 3000 users |
| [docs/SECURITY.md](docs/SECURITY.md) | Безопасность |
| [docs/TESTING.md](docs/TESTING.md) | Тестирование |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Дорожная карта |
| [docs/guides/AUTH-SETUP.md](docs/guides/AUTH-SETUP.md) | OAuth Yandex 360 |
| [docs/guides/WIKI-SETUP.md](docs/guides/WIKI-SETUP.md) | Wiki reader |
| [errors/DEPLOY.md](errors/DEPLOY.md) | Страницы ошибок в nginx/IIS |

itsupport@21vek.by · © IT Support 21vek
