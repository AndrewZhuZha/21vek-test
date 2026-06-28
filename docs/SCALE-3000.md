# Масштабирование до 3000 одновременных пользователей

Ветка `infra/scale-3000`: минимальные изменения без переписывания стека. Цель — выдержать **thundering herd** (~3000 одновременных открытий портала) на бюджетной Linux VM.

## Что гарантируется

- 3000 одновременных **открытий главной / Wiki** при уже существующих сессиях
- 3000 одновременных **чтений Wiki** при прогретом кэше и service token
- Статика (CSS/JS/assets) **не нагружает Node** — отдаётся nginx

## Что не гарантируется

- **3000 одновременных первых OAuth-логинов** — ограничения Yandex OAuth и очередь callback. Смягчено через `YANDEX360_DEFER_DIRECTORY=true`.

## Требования к VM (бюджетный production)

| Ресурс | Минимум |
|--------|---------|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Диск | 20 GB SSD |
| ОС | Ubuntu 22.04/24.04 LTS |

## Архитектура

```
Пользователи → nginx:80/443
                 ├─ /css, /js, /assets, /errors → диск (статика)
                 └─ /api, /, /wiki → portal×3 (Node) → Redis
```

## Переменные окружения (scale checklist)

```env
NODE_ENV=production
SESSION_STORE=redis
SESSION_REDIS_URL=redis://redis:6379
RATE_LIMIT_SCALE_MODE=true
REQUEST_LOG_SAMPLE_RATE=0.01
YANDEX360_DEFER_DIRECTORY=true

# Wiki: общий кэш для всех пользователей (обязательно при scale + wiki)
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=<service token>
YANDEX_WIKI_ORG_ID=...
```

Полный список: [`backend/.env.example`](../backend/.env.example).

## Docker (рекомендуется)

```bash
npm run build

docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.scale.yml \
  up -d --build --scale portal=3

curl http://localhost:8080/api/health
```

- nginx слушает `8080` (переменная `NGINX_HTTP_PORT`)
- Redis — сессии + wiki-кэш
- 3 реплики `portal` — балансировка через Docker DNS

Конфиг nginx: [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf).

## nginx на хосте (без Docker nginx)

1. Собрать артефакты: `npm run build`
2. Скопировать проект в `/opt/21vek-test`
3. Подключить [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf) (заменить `portal` на `127.0.0.1:3000` или upstream с несколькими портами)
4. Запустить 3 процесса Node на портах 3000–3002 с `SESSION_STORE=redis`

## Cron

```cron
# Wiki search index (каждые 6 ч)
0 */6 * * * cd /opt/21vek-test && npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1

# Прогрев Wiki-кэша после sync (нужен YANDEX_WIKI_OAUTH_TOKEN в .env)
15 */6 * * * cd /opt/21vek-test && npm run warm:wiki-cache >> /var/log/portal-wiki-warm.log 2>&1
```

## Нагрузочное тестирование

Требуется [k6](https://k6.io/). Сценарии: [`scripts/loadtest/`](../scripts/loadtest/).

```bash
# Статика через nginx
PORTAL_URL=http://localhost:8080 npm run loadtest:static

# API (без сессий — проверка 401 и отсутствия 429)
npm run loadtest:api

# Wiki (нужна cookie)
WIKI_SESSION_COOKIE="portal.sid=..." npm run loadtest:wiki
```

## Критерии приёмки

На VM 4 vCPU / 8 GB, 3× Node + Redis + nginx static:

| Сценарий | Цель |
|----------|------|
| 3000 VU GET статика | p95 < 500 ms, ошибок < 1% |
| 3000 VU GET `/api/auth/me` | p95 < 1 s, 429 < 1% |
| 3000 VU GET `/api/wiki/page` (прогретый кэш, с сессией) | p95 < 2 s, 429 < 5% |
| 500 VU OAuth login (реальный Yandex) | очередь < 10 мин |

Baseline «до» и результаты «после» фиксируйте в PR / wiki ops.

## Изменения в коде (кратко)

| Область | Файл | Изменение |
|---------|------|-----------|
| Rate limits | `backend/src/middleware/rateLimit.js` | per-session `/api/auth/me`, scale env |
| Config | `backend/src/config.js` | `RATE_LIMIT_SCALE_MODE`, sample logging |
| OAuth | `backend/src/routes/auth.js` | отложенный Directory lookup |
| Wiki cache | `backend/src/middleware/wikiCache.js` | 2000 in-memory entries |
| Logging | `backend/src/index.js` | `REQUEST_LOG_SAMPLE_RATE` |
| Infra | `docker-compose.scale.yml`, `deploy/nginx/portal.conf` | Redis, nginx, 3 replicas |

См. также: [DEPLOY.md](./DEPLOY.md).
