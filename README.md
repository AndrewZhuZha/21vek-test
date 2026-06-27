# ИТ-портал 21vek

Корпоративная стартовая страница: карточки услуг, заявки в Яндекс Трекер (очередь ITHELP), поиск, сброс пароля, ссылки на CMDB/Wiki, вход через корпоративные учётные записи Yandex 360.

Статический фронтенд + Node.js backend для OAuth. Секреты OAuth — только в `backend/.env`.

## Возможности

- Карточки по разделам (техподдержка, HR, оборудование, сеть, СКУД, принтеры, …)
- **Вход через Яндекс 360** (@21vek.by): gate, аватар в шапке, автоподстановка ФИО
- Формы заявок в модальных окнах; `hr_new` — двухшаговый мастер
- Поиск: синонимы, раскладка, фильтрация разделов; **Ctrl/Cmd+F** и **/**
- Темы light/dark/system, сохранение в localStorage
- Сброс пароля из шапки
- Мини-экскурсия (кнопка «Показать тур»; настраивается в конфиге)
- Счётчик заявок в подвале (локально + опционально API)

**Demo-режим backend** (`TRACKER_DEMO_MODE=true`): API возвращает тестовый `issueKey` без отправки в prod Tracker.

FAQ и Регламенты в шапке — заглушки «скоро».

## Запуск

### С авторизацией (рекомендуется)

```bash
npm install
cd backend && copy .env.example .env   # заполнить YANDEX_CLIENT_ID, SECRET, SESSION_SECRET
cd .. && npm start                     # http://localhost:3000
```

Быстрая настройка: `npm run setup:auth` → заполните ключи в `backend/.env` → `npm start`.

Инструкция для администратора: [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md). Деплой: [docs/DEPLOY.md](docs/DEPLOY.md).

### Только статика (без backend)

Разместить файлы на веб-сервере или открыть через локальный HTTP. В `js/config.local.js` отключите auth:

```javascript
window.PortalConfigLocal = { auth: { enabled: false } };
```

## Сборка артефактов

Требуется Node.js 18+.

```bash
npm run build          # поиск + страницы ошибок
npm run build:search   # js/search-index.js, js/request-types.js
npm run build:errors   # errors/*.html
```

После правок `data/request-types.json` или `data/search.overrides.json` — пересобрать search.

Страницы ошибок: `errors/` + [errors/DEPLOY.md](errors/DEPLOY.md).

## Настройка

- [js/config.js](js/config.js) — базовый конфиг
- [js/config.local.js](js/config.local.js) — переопределения среды (шаблон: [js/config.local.example.js](js/config.local.example.js))

Новая услуга: карточка в `index.html` → запись в `data/request-types.json` → `npm run build:search`.

## Документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — модули, события, контракты
- [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) — настройка Yandex OAuth и backend
- [docs/DEPLOY.md](docs/DEPLOY.md) — production: Docker, nginx, systemd
- [docs/SECURITY.md](docs/SECURITY.md) — политики безопасности и hardening
- [docs/SMOKE-TESTS.md](docs/SMOKE-TESTS.md) — чек-лист перед релизом
- [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) — открытый backlog

## Контакты

itsupport@21vek.by · © IT Support 21vek
