# Деплой в production

Схема: **Linux VM + nginx + Node.js**. GitHub Pages не поддерживает OAuth backend.

## Переменные окружения

```env
NODE_ENV=production
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=              # 32+ символов
SESSION_STORE=memory         # memory | redis
SESSION_REDIS_URL=           # при SESSION_STORE=redis
REQUEST_LOGGING=true
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true       # false запрещён до реализации prod Tracker API
GUEST_REQUEST_TYPES=
PORT=3000
PUBLIC_URL=https://portal.21vek.by
```

`PUBLIC_URL` = URL в браузере (без `/`). Redirect URI в [oauth.yandex.ru](https://oauth.yandex.ru/): `{PUBLIC_URL}/api/auth/callback`.

Генерация `.env`: `npm run setup:auth`

## Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl http://localhost:3000/api/health
```

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name portal.21vek.by;

    ssl_certificate     /etc/ssl/certs/portal.crt;
    ssl_certificate_key /etc/ssl/private/portal.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

Страницы ошибок: [errors/DEPLOY.md](../errors/DEPLOY.md).

## systemd (без Docker)

```ini
[Unit]
Description=21vek IT Portal
After=network.target

[Service]
Type=simple
User=portal
WorkingDirectory=/opt/21vek-test
Environment=NODE_ENV=production
EnvironmentFile=/opt/21vek-test/backend/.env
ExecStart=/usr/bin/node backend/src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Проверка после деплоя

```bash
curl -s https://portal.21vek.by/api/health
curl -s https://portal.21vek.by/api/auth/config-check
PORTAL_URL=https://portal.21vek.by npm run verify:auth
```

Ручной чек-лист: [SMOKE-TESTS.md](SMOKE-TESTS.md).

## Безопасность

- Заявки (`POST /api/tracker/*`) и logout — только с сессией @21vek.by.
- CSRF-проверка Origin/Referer, rate limiting, helmet/CSP, cookie `httpOnly` + `Secure` + `sameSite`.
- OAuth token не хранится в сессии; `session.regenerate()` после login.
- `backend/.env` на сервере, права `600`, не в git.
- `YANDEX_OAUTH_TLS_INSECURE=true` блокируется при `NODE_ENV=production`.
- Портал закрыт от индексации: `robots.txt`, `<meta robots noindex>`.

## GitHub Pages preview

Ветка `testing-cursor` — статика без backend (`auth.enabled: false` через `config.preview.js`).
