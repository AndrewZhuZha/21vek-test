# Настройка авторизации через Yandex 360

Пошаговая инструкция для администратора: регистрация OAuth-приложения и запуск backend портала.

## Что получится

1. Сотрудник открывает ссылку на ИТ-портал.
2. Если не авторизован — видит экран «Войти через Яндекс».
3. На странице Яндекса вводит логин и пароль **корпоративной** учётной записи `@21vek.by`.
4. После успеха — портал, аватар и имя в шапке, ФИО подставляется в формы заявок.

Логин и пароль **не хранятся** на портале — только сессия в httpOnly-cookie.

---

## 1. Регистрация OAuth-приложения

1. Войдите в [oauth.yandex.ru](https://oauth.yandex.ru/) под учётной записью администратора организации Yandex 360.
2. Нажмите **Создать приложение** (или «Зарегистрировать новое приложение»).
3. Тип приложения: **Веб-сервисы**.
4. Название, например: `ИТ-портал 21vek`.
5. **Redirect URI** — добавьте оба адреса (dev и prod):

   | Среда | Redirect URI |
   |-------|----------------|
   | Локальная разработка | `http://localhost:3000/api/auth/callback` |
   | Production | `https://<ваш-домен-портала>/api/auth/callback` |

   Production URL задаётся при деплое. Пока можно оставить только localhost.

6. **Права доступа (scopes):**
   - `login:email` — адрес почты
   - `login:info` — имя и логин
   - `login:avatar` — аватар

7. Сохраните приложение и скопируйте:
   - **Client ID** (ID приложения)
   - **Client Secret** (Пароль приложения)

---

## 2. Настройка backend

Автоматически (рекомендуется):

```bash
npm run setup:auth
```

Скрипт создаёт `backend/.env` с `SESSION_SECRET` и выводит чек-лист OAuth. Заполните `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET`.

Вручную:

```bash
cd backend
npm install
copy .env.example .env   # Windows
# cp .env.example .env     # Linux/macOS
```

Заполните `backend/.env`:

```env
YANDEX_CLIENT_ID=ваш_client_id
YANDEX_CLIENT_SECRET=ваш_client_secret
SESSION_SECRET=случайная_строка_32_символа_или_больше
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true
GUEST_REQUEST_TYPES=
PORT=3000
PUBLIC_URL=http://localhost:3000
```

**SESSION_SECRET** — любая длинная случайная строка, например:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`PUBLIC_URL` должен **точно совпадать** с адресом, по которому пользователи открывают портал (без слэша в конце). От него строится `redirect_uri`.

---

## 3. Запуск

Из корня репозитория:

```bash
npm install          # один раз: зависимости backend
npm start            # http://localhost:3000
```

Если `npm install` падает с `SELF_SIGNED_CERT_IN_CHAIN` (корпоративный прокси):

```bash
npm install --prefix backend --strict-ssl=false
```

Или только backend:

```bash
cd backend && npm start
```

Проверка конфигурации: `GET http://localhost:3000/api/auth/config-check`

Автоматические smoke-тесты API:

```bash
npm run verify:auth
```

---

## 4. Настройка frontend

В [`js/config.js`](../js/config.js) по умолчанию:

```javascript
auth: {
    enabled: true,
    requireAuth: true,
    guestRequestTypes: [],
    autoFillFio: true,
    loginUrl: '/api/auth/login',
    logoutUrl: '/api/auth/logout',
    userInfoUrl: '/api/auth/me'
}
```

`guestRequestTypes` на frontend подтягиваются из backend при старте (`GET /api/auth/config-check`). Источник правды для whitelist — `GUEST_REQUEST_TYPES` в `backend/.env` (через запятую, например `tech_support,hr_new`).

Для локальной разработки **без** OAuth создайте `js/config.local.js`:

```javascript
window.PortalConfigLocal = {
    auth: {
        enabled: false
    }
};
```

Или оставьте auth включённым, но отключите gate:

```javascript
window.PortalConfigLocal = {
    auth: {
        requireAuth: false
    }
};
```

---

## 5. Проверка

| Шаг | Ожидание |
|-----|----------|
| Открыть портал без сессии | Экран «Войти через Яндекс» |
| Войти учёткой `@21vek.by` | Портал, аватар в шапке |
| Открыть форму заявки | Поле ФИО заполнено |
| «Выйти» | Снова экран входа |
| Войти с email не `@21vek.by` | Отказ с сообщением о домене |

---

## 6. Деплой в production

1. Задайте в `.env`: `PUBLIC_URL=https://portal.21vek.by` (ваш реальный URL).
2. Добавьте prod Redirect URI в приложение на oauth.yandex.ru.
3. Запустите Node-сервер (PM2, systemd, Docker).
4. Поставьте nginx reverse proxy:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

5. Убедитесь, что `NODE_ENV=production` — cookie сессии будет с флагом `Secure` (нужен HTTPS).

---

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| `redirect_uri does not match` | Redirect URI в Yandex OAuth должен **буквально** совпадать с `{PUBLIC_URL}/api/auth/callback` |
| После входа снова gate | Cookie не сохраняется: проверьте HTTPS в prod, `trust proxy` в nginx, один домен для API и статики |
| `503` при клике «Войти» | Не заполнены `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` в `.env` |
| Доступ запрещён для своей учётки | Email должен оканчиваться на `@21vek.by` (см. `ALLOWED_EMAIL_DOMAIN`) |
| `invalid_state` | Повторите вход; не открывайте callback URL вручную |
| `403 CSRF-проверка не пройдена` при submit/logout | `PUBLIC_URL` должен совпадать с адресом в браузере; в dev допустимы `localhost` и `127.0.0.1` на одном порту |
| `fetch failed` после входа в Yandex | Корпоративный SSL-прокси: задайте `YANDEX_OAUTH_TLS_INSECURE=true` в `backend/.env` (только dev) или добавьте корневой сертификат через `NODE_EXTRA_CA_CERTS` |

---

## API (контракт)

| Endpoint | Метод | Ответ |
|----------|-------|-------|
| `/api/auth/login` | GET | Redirect на Yandex OAuth |
| `/api/auth/callback` | GET | Обработка code, redirect на `/` |
| `/api/auth/me` | GET | `{ displayName, email, login, avatarUrl }` или 401 |
| `/api/auth/logout` | POST | `{ ok: true }` |
| `/api/auth/config-check` | GET | Dev: `{ configured, guestRequestTypes, trackerDemoMode, redirectUri, allowedEmailDomain }`, Prod: `{ configured, guestRequestTypes, trackerDemoMode }` |
| `/api/tracker/issues` | POST | `401` без сессии, `issueKey` в demo/proxy режиме |
| `/api/tracker/password-reset` | POST | `401` без сессии, `issueKey` в demo/proxy режиме |
| `/api/health` | GET | `{ ok: true, service: '21vek-it-portal' }` |

Секреты OAuth **никогда** не попадают в `js/config.js` — только в `backend/.env`.
