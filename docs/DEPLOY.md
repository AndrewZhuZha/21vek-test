# Деплой ИТ-портала с авторизацией

Рекомендуемая production-схема: **Linux VM + nginx + Node.js**.

GitHub Pages **не поддерживает** OAuth backend (`/api/auth/*`).

---

## 1. Выбор домена

Примеры:

| Среда | URL | Redirect URI в OAuth |
|-------|-----|----------------------|
| Dev | `http://localhost:3000` | `http://localhost:3000/api/auth/callback` |
| Prod | `https://portal.21vek.by` | `https://portal.21vek.by/api/auth/callback` |

`PUBLIC_URL` в `.env` должен **точно** совпадать с URL, который видят пользователи (без `/` в конце).

После выбора prod-домена добавьте Redirect URI в [oauth.yandex.ru](https://oauth.yandex.ru/).

---

## 2. Переменные окружения (production)

```env
NODE_ENV=production
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
SESSION_SECRET=...          # 32+ случайных символов
SESSION_STORE=memory        # memory | redis
SESSION_REDIS_URL=          # обязательно при SESSION_STORE=redis
REQUEST_LOGGING=true        # structured request logs
ALLOWED_EMAIL_DOMAIN=21vek.by
TRACKER_DEMO_MODE=true      # false сейчас запрещён: prod Tracker API ещё не реализован
GUEST_REQUEST_TYPES=
PORT=3000
PUBLIC_URL=https://portal.21vek.by
```

Генерация `.env`: `node scripts/setup-auth-env.mjs`

---

## 2.1 Индексация (intranet)

По умолчанию портал закрыт от индексации:

- `<meta name="robots" content="noindex,nofollow">` в `index.html`;
- `robots.txt` с `Disallow: /`.

Если портал должен индексироваться внешними поисковиками, пересмотрите эти настройки перед релизом.

---

## 3. Docker (рекомендуется)

```bash
# backend/.env заполнен
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Проверка: `curl http://localhost:3000/api/health`

`docker-compose.prod.yml` добавляет production overrides: `read_only`, `tmpfs=/tmp`, `no-new-privileges`, `cap_drop: [ALL]`, `init: true`.
Контейнер запускается от non-root пользователя `node` (см. `Dockerfile`).

---

## 4. nginx reverse proxy

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

    # Доп. защита на уровне reverse proxy
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

При `NODE_ENV=production` cookie сессии получает флаг `Secure` (нужен HTTPS).

---

## 5. systemd (без Docker)

Файл `/etc/systemd/system/portal-21vek.service`:

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
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable portal-21vek
sudo systemctl start portal-21vek
```

---

## 6. PM2 (альтернатива systemd)

```bash
cd /opt/21vek-test
NODE_ENV=production pm2 start backend/src/index.js --name portal-21vek
pm2 save
pm2 startup
```

---

## 7. Проверка после деплоя

```bash
curl -s https://portal.21vek.by/api/health
curl -s https://portal.21vek.by/api/auth/config-check
curl -s -X POST https://portal.21vek.by/api/tracker/issues -H "Content-Type: application/json" -d '{"requestType":"tech_support"}'
node scripts/verify-auth-smoke.mjs   # PORTAL_URL=https://portal.21vek.by
```

Ручной чек-лист: [SMOKE-TESTS.md](SMOKE-TESTS.md) §10.
Политики безопасности: [SECURITY.md](SECURITY.md).
Production checklist: [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md).

---

## 8. GitHub Pages preview

Ветка `testing-cursor` деплоится как **статика** без backend. CI автоматически подключает `js/config.preview.js` (`auth.enabled: false`).
