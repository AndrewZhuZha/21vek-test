# Безопасность ИТ-портала 21vek

Этот документ описывает обязательный baseline безопасности для тестовой и production-среды.

## 1. Модель доступа

- Статика (`index.html`, `js/*`, `css/*`) может быть доступна без сессии.
- Любые state-changing API (`POST /api/tracker/*`, `POST /api/auth/logout`) защищены на backend.
- Без активной сессии Yandex OAuth (`@21vek.by`) заявки не отправляются.
- Guest-заявки отключены по умолчанию: `GUEST_REQUEST_TYPES=`.

## 2. Что защищает backend

| Контроль | Где | Что блокирует |
|----------|-----|----------------|
| `requireAuth` / `requireAuthOrGuestRequest` | `backend/src/middleware/requireAuth.js` | Отправка заявок без сессии |
| CSRF Origin/Referer check | `backend/src/middleware/csrf.js` | Cross-site POST |
| Rate limiting | `backend/src/middleware/rateLimit.js` | Brute-force/флуд |
| Security headers (`helmet`) | `backend/src/index.js` | Clickjacking, MIME sniffing, часть XSS-векторов |
| Payload validation | `backend/src/tracker/validate.js` | Мусорные/вредоносные payload |
| Production hardening `/api/auth/config-check` | `backend/src/routes/auth.js` | Лишняя утечка конфигурации |

## 3. Переменные окружения

`backend/.env`:

```env
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true
GUEST_REQUEST_TYPES=
PORT=3000
PUBLIC_URL=http://localhost:3000
```

Рекомендации:

- `SESSION_SECRET`: минимум 32 случайных байта.
- `TRACKER_DEMO_MODE=true` для test-стенда до подключения реального Tracker API.
- `GUEST_REQUEST_TYPES` оставлять пустым, пока не утверждён whitelist.

## 4. Деплой-требования

- Только HTTPS в test/prod (`NODE_ENV=production` + `Secure` cookie).
- Один origin для frontend и backend (`PUBLIC_URL` должен совпадать с внешним URL).
- `backend/.env` хранить только на сервере, права `600`.
- GitHub Pages использовать только как UI preview без backend/auth.

## 5. Smoke-check безопасности

Минимальные проверки после каждого деплоя:

1. `GET /api/health` → `200`.
2. `GET /api/auth/me` без сессии → `401`.
3. `POST /api/tracker/issues` без сессии → `401`.
4. Вход `@21vek.by` работает, logout возвращает на gate.
5. В production `GET /api/auth/config-check` не раскрывает `redirectUri`.

Автоматизация: `npm run verify:auth`.
