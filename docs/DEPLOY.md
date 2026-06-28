# Деплой в production

Схема: **Linux VM + nginx + Node.js**. GitHub Pages не поддерживает OAuth backend.

**Масштабирование до ~3000 одновременных пользователей:** см. [SCALE-3000.md](SCALE-3000.md) (ветка `infra/scale-3000`, Redis, nginx static offload, 3 реплики Node).

## Переменные окружения

```env
NODE_ENV=production
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
SESSION_SECRET=              # 32+ символов
SESSION_STORE=memory         # memory | redis (для scale: redis, см. SCALE-3000.md)
SESSION_REDIS_URL=           # при SESSION_STORE=redis
REQUEST_LOGGING=true
REQUEST_LOG_SAMPLE_RATE=1    # при scale: 0.01
RATE_LIMIT_SCALE_MODE=false  # true для 3000+ users (требует redis)
YANDEX360_DEFER_DIRECTORY=false
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true       # false запрещён до реализации prod Tracker API
GUEST_REQUEST_TYPES=
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=
YANDEX_WIKI_ORG_ID=
YANDEX_WIKI_BASE_SLUG=homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov
YANDEX_WIKI_CACHE_TTL_SEC=300
YANDEX_WIKI_TREE_CACHE_TTL_SEC=300
YANDEX_WIKI_PAGE_CACHE_TTL_SEC=300
YANDEX_WIKI_SEARCH_CACHE_TTL_SEC=120
YANDEX_WIKI_REQUEST_TIMEOUT_MS=15000
YANDEX_WIKI_MAX_RESPONSE_BYTES=5242880
YANDEX_WIKI_DESCENDANTS_MAX=500
YANDEX_WIKI_EXTERNAL_URL=https://wiki.yandex.ru/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/
PORT=3000
PUBLIC_URL=https://portal.21vek.by
```

`PUBLIC_URL` = URL в браузере (без `/`). Redirect URI в [oauth.yandex.ru](https://oauth.yandex.ru/): `{PUBLIC_URL}/api/auth/callback`.

Генерация `.env`: `npm run setup:auth`

## Docker

Один инстанс:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl http://localhost:3000/api/health
```

Scale (3 реплики + Redis + nginx):

```bash
npm run build
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.scale.yml up -d --build --scale portal=3
curl http://localhost:8080/api/health
```

Подробнее: [SCALE-3000.md](SCALE-3000.md).

## nginx

Базовый вариант (всё через Node):

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

**Scale mode** (статика с диска, API на upstream): готовый конфиг [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf).

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

## Cron синхронизации Wiki

Чтобы обновлять `data/wiki-search.json` и подсказки поиска:

```cron
0 */6 * * * cd /opt/21vek-test && /usr/bin/npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1
```

Если используете Docker с `read_only: true`, закрепите один режим:

- **Bake artifacts в image** (предпочтительно для immutable deploy).
- **Writable volume на `/app/data`** + cron/sidecar (`docker-compose.prod.yml` уже монтирует volume).

## Проверка после деплоя

```bash
curl -s https://portal.21vek.by/api/health
curl -s https://portal.21vek.by/api/auth/config-check
PORTAL_URL=https://portal.21vek.by npm run verify:auth
PORTAL_URL=https://portal.21vek.by WIKI_EXPECT_ENABLED=true npm run verify:wiki
```

Ручной чек-лист: [SMOKE-TESTS.md](SMOKE-TESTS.md).

## Безопасность

- Заявки (`POST /api/tracker/*`) и logout — только с сессией @21vek.by.
- CSRF-проверка Origin/Referer, rate limiting, helmet/CSP, cookie `httpOnly` + `Secure` + `sameSite`.
- OAuth access token хранится в server-side session (нужен для Wiki API и Directory); cookie `httpOnly` + `Secure` + `sameSite`. `session.regenerate()` после login.
- `backend/.env` на сервере, права `600`, не в git.
- `YANDEX_OAUTH_TLS_INSECURE=true` блокируется при `NODE_ENV=production`.
- Портал закрыт от индексации: `robots.txt`, `<meta robots noindex>`.

## Rollback Wiki

1. Установить `YANDEX_WIKI_ENABLED=false` и перезапустить backend.
2. При проблеме с индексом вернуть предыдущий `data/wiki-search.json` и выполнить `npm run build:search`.
3. Подтвердить fallback: `/api/wiki/config-check` показывает `enabled=false`, а ссылки ведут на внешнюю Wiki.
