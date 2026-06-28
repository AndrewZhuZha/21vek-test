# Настройка авторизации Yandex 360

## 1. OAuth-приложение

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → **Создать приложение** → тип **Веб-сервисы**.
2. **Redirect URI:**
   - Dev: `http://localhost:3000/api/auth/callback`
   - Prod: `https://<домен>/api/auth/callback`
3. Scopes: `login:email`, `login:info`, `login:avatar`.
4. Для Wiki reader добавьте **`wiki:read`** (см. [WIKI-SETUP.md](WIKI-SETUP.md)).
5. Скопируйте **Client ID** и **Client Secret**.

## 2. Backend

```bash
npm run setup:auth
```

Заполните в `backend/.env`:

```env
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=              # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true
PUBLIC_URL=http://localhost:3000
PORT=3000
```

`PUBLIC_URL` — адрес без `/` в конце; от него строится `redirect_uri`.

## 3. Запуск и проверка

```bash
npm start
curl http://localhost:3000/api/auth/config-check
npm run verify:auth
```

| Шаг | Ожидание |
|-----|----------|
| Портал без сессии | Экран «Войти через Яндекс» |
| Вход @21vek.by | Портал, аватар, ФИО в формах |
| Logout | Снова экран входа |
| Email не @21vek.by | Отказ |

## 4. Frontend

По умолчанию в [`js/config.js`](../../js/config.js): `auth.enabled: true`, `requireAuth: true`.

Локально без OAuth — `js/config.local.js`:

```javascript
window.PortalConfigLocal = { auth: { enabled: false } };
```

`guestRequestTypes` задаётся в backend (`GUEST_REQUEST_TYPES`), подтягивается через `/api/auth/config-check`.

## API

| Endpoint | Метод | Ответ |
|----------|-------|-------|
| `/api/auth/login` | GET | Redirect на Yandex |
| `/api/auth/callback` | GET | Сессия, redirect на `/` |
| `/api/auth/me` | GET | Профиль или 401 |
| `/api/auth/logout` | POST | `{ ok: true }` |
| `/api/auth/config-check` | GET | Статус конфигурации |
| `/api/health` | GET | `{ ok: true }` |

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| `redirect_uri does not match` | Redirect URI в Yandex = `{PUBLIC_URL}/api/auth/callback` |
| После входа снова gate | HTTPS в prod, `X-Forwarded-Proto` в nginx, один домен |
| `503` при «Войти» | Не заполнены `YANDEX_CLIENT_ID` / `SECRET` |
| `403 CSRF` при submit/logout | `PUBLIC_URL` совпадает с URL в браузере |
| `fetch failed` (корп. прокси) | Dev: `YANDEX_OAUTH_TLS_INSECURE=true` или `NODE_EXTRA_CA_CERTS` |

Production: [DEPLOY.md](../DEPLOY.md). Безопасность: [SECURITY.md](../SECURITY.md).
