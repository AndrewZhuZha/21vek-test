# Масштабирование

Цель: выдержать **thundering herd** (~3000 одновременных открытий портала) на бюджетной Linux VM без смены стека.

## Что гарантируется

- 3000 одновременных открытий главной / Wiki при существующих сессиях
- 3000 одновременных чтений Wiki при прогретом кэше и service token
- Статика (CSS/JS/assets) не нагружает Node — отдаётся nginx

## Что не гарантируется

- **3000 одновременных первых OAuth-логинов** — лимиты Yandex OAuth. Смягчается `YANDEX360_DEFER_DIRECTORY=true`.

## Требования к VM

| Ресурс | Минимум |
|--------|---------|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Диск | 20 GB SSD |
| ОС | Ubuntu 22.04/24.04 LTS |

## Архитектура

```
Пользователи → nginx:80/443
                 ├─ /css, /js, /assets, /errors → диск
                 └─ /api, /, /wiki → portal×3 → Redis
```

Конфиг nginx: [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf).

## Переменные окружения (scale checklist)

```env
NODE_ENV=production
SESSION_STORE=redis
SESSION_REDIS_URL=redis://redis:6379
RATE_LIMIT_SCALE_MODE=true
REQUEST_LOG_SAMPLE_RATE=0.01
YANDEX360_DEFER_DIRECTORY=true

YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=<service token>
YANDEX_WIKI_ORG_ID=...
```

Полный список: [`backend/.env.example`](../backend/.env.example).

`validateSecurityConfig()` блокирует `RATE_LIMIT_SCALE_MODE=true` + `SESSION_STORE=memory`.

## Docker

```bash
npm run build

docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.scale.yml \
  up -d --build --scale portal=3

curl http://localhost:8080/api/health
```

- nginx слушает `8080` (`NGINX_HTTP_PORT`)
- Redis — сессии + wiki cache
- 3 реплики `portal` — балансировка Docker DNS

## nginx на хосте (без Docker nginx)

1. `npm run build`
2. Скопировать проект в `/opt/21vek-test`
3. Подключить [`deploy/nginx/portal.conf`](../deploy/nginx/portal.conf) (upstream на 3000–3002)
4. Запустить 3 процесса Node с `SESSION_STORE=redis`

## Оптимизации в коде

| Область | Изменение |
|---------|-----------|
| Session | Только для `/api/*`; rolling cookie |
| Rate limits | Per-session `/api/auth/me`; scale env tunables |
| OAuth | Directory lookup отложен на `/api/auth/me` |
| Wiki | Service token + shared Redis cache; 2000 memory entries |
| Logging | Sample rate 1% при scale |
| Static | nginx offload bundles |

## Cron (scale)

```cron
0 */6 * * * cd /opt/21vek-test && npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1
15 */6 * * * cd /opt/21vek-test && npm run warm:wiki-cache >> /var/log/portal-wiki-warm.log 2>&1
```

## Нагрузочное тестирование

Требуется k6. Сценарии: [`scripts/loadtest/`](../scripts/loadtest/).

```bash
PORTAL_URL=http://localhost:8080 npm run loadtest:static
PORTAL_URL=http://localhost:3000 npm run loadtest:api
WIKI_SESSION_COOKIE="portal.sid=..." npm run loadtest:wiki
npm run loadtest:heavy   # 3000 VU autocannon
```

## Критерии приёмки

VM 4 vCPU / 8 GB, 3× Node + Redis + nginx static:

| Сценарий | Цель |
|----------|------|
| 3000 VU GET статика | p95 < 500 ms, ошибок < 1% |
| 3000 VU GET `/api/auth/me` | p95 < 1 s, 429 < 1% |
| 3000 VU GET `/api/wiki/page` (прогретый кэш) | p95 < 2 s, 429 < 5% |
| 500 VU OAuth login (реальный Yandex) | очередь < 10 мин |

Фиксируйте baseline и результаты в PR / ops wiki.

См. также: [DEPLOY.md](DEPLOY.md), [OPERATIONS.md](OPERATIONS.md).
