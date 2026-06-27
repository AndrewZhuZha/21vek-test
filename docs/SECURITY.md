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
| `validateSecurityConfig()` | `backend/src/config.js` | Небезопасный production (TLS bypass, короткий SESSION_SECRET, http PUBLIC_URL) |
| OAuth token не хранится в сессии | `backend/src/session.js`, `backend/src/routes/auth.js` | Утечка Yandex bearer token при компрометации сессии |
| Session regeneration после OAuth | `backend/src/routes/auth.js` | Session fixation |
| Whitelist avatar URL | `backend/src/auth/yandex.js`, `js/auth/ui.js` | Подмена src аватара |

## 3. Переменные окружения

`backend/.env`:

```env
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=
SESSION_STORE=memory
SESSION_REDIS_URL=
REQUEST_LOGGING=true
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true
GUEST_REQUEST_TYPES=
PORT=3000
PUBLIC_URL=http://localhost:3000
```

Рекомендации:

- `SESSION_SECRET`: минимум 32 случайных байта.
- `SESSION_STORE`: `memory` (single-instance) или `redis` (рекомендуется для production).
- `REQUEST_LOGGING=true`: включает structured request logging с `X-Request-Id`.
- `TRACKER_DEMO_MODE=true` для test-стенда до подключения реального Tracker API.
- `YANDEX_OAUTH_TLS_INSECURE=true` — только для локальной разработки за корп. прокси; в production сервер не стартует.
- `YANDEX360_USE_DIRECTORY=true` — должность подтягивается один раз при входе, OAuth-токен в сессию не сохраняется.

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
