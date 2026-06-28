# Эксплуатация

Руководство для администраторов: cron, мониторинг, Redis, troubleshooting.

## Cron

### Wiki search index (каждые 6 часов)

```cron
0 */6 * * * cd /opt/21vek-test && /usr/bin/npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1
```

`refresh:wiki-search` выполняет sync + build + validate атомарно.

### Прогрев Wiki-кэша (после sync, scale mode)

```cron
15 */6 * * * cd /opt/21vek-test && /usr/bin/npm run warm:wiki-cache >> /var/log/portal-wiki-warm.log 2>&1
```

Требует `YANDEX_WIKI_OAUTH_TOKEN` в `.env`. Рекомендуется при 3+ репликах Node.

## Мониторинг

### Health endpoints

| Endpoint | Доступ | Содержимое |
|----------|--------|------------|
| `GET /api/health` | Публичный | `{ ok, service }` — для load balancer |
| `GET /api/health/details` | Auth | Wiki config, snapshot, cache diagnostics |

Не используйте `/api/health/details` в публичных probe — минимизирует info disclosure.

### Логи

HTTP-логи — JSON в stdout (`event: http_request`). При scale:

```env
REQUEST_LOG_SAMPLE_RATE=0.01
```

Статика и `/api/health` не логируются. Ошибки: `event: unhandled_server_error` с `requestId`.

Корреляция: заголовок `X-Request-Id` в ответах.

## Redis

| Prefix | Назначение |
|--------|------------|
| `portal:sess:` | express-session (connect-redis) |
| `portal:wiki:` | Wiki page/tree/search cache |

При недоступности Redis Wiki-кэш деградирует в memory-only (per-instance). Сессии при `SESSION_STORE=redis` требуют работающий Redis.

## Wiki sync и rollback

### Sync

```bash
cd /opt/21vek-test
npm run refresh:wiki-search
```

Обновляет `data/wiki-search.json` и пересобирает `js/search-index.js`.

### Rollback

1. `YANDEX_WIKI_ENABLED=false` + restart.
2. Откат `data/wiki-search.json` из backup → `npm run build:search`.
3. Проверка `/api/wiki/config-check`.

Подробнее: [guides/WIKI-SETUP.md](guides/WIKI-SETUP.md).

## Read-only Docker

Два валидных режима (не смешивать):

1. **Bake artifacts в image** — `refresh:wiki-search` на CI до `docker build`.
2. **Writable volume** на `/app/data` + cron на хосте/sidecar.

См. `docker-compose.prod.yml` (volume `portal_wiki_data`).

## Troubleshooting

### OAuth

| Симптом | Действие |
|---------|----------|
| `redirect_uri does not match` | Redirect URI в Yandex = `{PUBLIC_URL}/api/auth/callback` |
| После login снова gate | Проверить `X-Forwarded-Proto`, один домен, HTTPS |
| `503` на login | Заполнить `YANDEX_CLIENT_ID` / `SECRET` |
| `403 CSRF` | `PUBLIC_URL` = URL в браузере |

### Wiki

| Симптом | Действие |
|---------|----------|
| 401 на `/api/wiki/tree` | Re-login; scope `wiki:read` в OAuth app |
| 403 на asset | Re-login или service token |
| 502 на asset | Лог backend; TLS (`NODE_EXTRA_CA_CERTS`) |
| Пустое дерево | `YANDEX_WIKI_BASE_SLUG`, права токена |
| Reader disabled | `YANDEX_WIKI_ENABLED=true`, restart |

Parser QA: [guides/WIKI-QA.md](guides/WIKI-QA.md).

### Сессии

| Симптом | Действие |
|---------|----------|
| Logout всех при deploy | Перейти на `SESSION_STORE=redis` |
| 429 на `/api/auth/me` | Scale limits; проверить `RATE_LIMIT_SCALE_MODE` |
| Потеря сессии между репликами | Redis обязателен при >1 инстансе |

## Graceful shutdown

Node обрабатывает `SIGTERM`/`SIGINT`: закрывает HTTP server, timeout 10s. Docker/K8s должны давать достаточный `stop_grace_period`.

## Связанные документы

- [DEPLOY.md](DEPLOY.md) — первичный деплой
- [SCALE.md](SCALE.md) — масштабирование
- [SECURITY.md](SECURITY.md) — prod checklist
- [TESTING.md](TESTING.md) — smoke после изменений
