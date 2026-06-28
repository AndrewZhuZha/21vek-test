# Деплой в production

Схема: **Linux VM + nginx + Node.js** (или Docker). GitHub Pages не поддерживает OAuth backend.

Масштабирование до ~3000 пользователей: [SCALE.md](SCALE.md).

## Чеклист переменных окружения

Полный шаблон: [`backend/.env.example`](../backend/.env.example).

### Обязательные (production)

```env
NODE_ENV=production
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=              # 32+ случайных символов
PUBLIC_URL=https://portal.21vek.by
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true       # false запрещён до prod Tracker API
```

### Сессии

```env
SESSION_STORE=redis          # рекомендуется в prod
SESSION_REDIS_URL=redis://127.0.0.1:6379
SESSION_MAX_AGE_DAYS=7
```

### Wiki (если включена)

```env
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=     # service token обязателен в prod
YANDEX_WIKI_ORG_ID=
YANDEX_WIKI_BASE_SLUG=homepage/...
YANDEX_WIKI_EXTERNAL_URL=https://wiki.yandex.ru/...
```

### Scale (опционально)

```env
RATE_LIMIT_SCALE_MODE=true
REQUEST_LOG_SAMPLE_RATE=0.01
YANDEX360_DEFER_DIRECTORY=true
```

Генерация `.env`: `npm run setup:auth`.

`PUBLIC_URL` — URL в браузере без `/`. Redirect URI в [oauth.yandex.ru](https://oauth.yandex.ru/): `{PUBLIC_URL}/api/auth/callback`.

## Сборка перед деплоем

```bash
npm run build
npm run verify:security
```

## Docker

### Один инстанс

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl http://localhost:3000/api/health
```

### Scale (3 реплики + Redis + nginx)

```bash
npm run build
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.scale.yml \
  up -d --build --scale portal=3
curl http://localhost:8080/api/health
```

Подробнее: [SCALE.md](SCALE.md).

## nginx

### Базовый (всё через Node)

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
}
```

### Scale mode (статика с диска)

Готовый конфиг: [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf).

Страницы ошибок на edge: [errors/DEPLOY.md](../errors/DEPLOY.md).

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
PORTAL_URL=https://portal.21vek.by WIKI_EXPECT_ENABLED=true npm run verify:wiki
```

Ручной чек-лист: [TESTING.md](TESTING.md).

## Безопасность (кратко)

Полная модель: [SECURITY.md](SECURITY.md).

- `backend/.env` на сервере, права `600`, не в git
- `YANDEX_OAUTH_TLS_INSECURE=true` блокируется в production
- CSRF Origin/Referer, rate limits, Helmet/CSP
- Cookie `httpOnly` + `Secure` + `sameSite: lax`
- `session.regenerate()` после login
- `/data/*` не публичен
- `robots.txt` + `<meta robots noindex>`

## Rollback Wiki

1. `YANDEX_WIKI_ENABLED=false` → перезапуск backend.
2. При проблеме с индексом — откат `data/wiki-search.json`, `npm run build:search`.
3. Проверить: `/api/wiki/config-check` → `enabled=false`, ссылки на внешнюю Wiki.

Cron и эксплуатация: [OPERATIONS.md](OPERATIONS.md).
