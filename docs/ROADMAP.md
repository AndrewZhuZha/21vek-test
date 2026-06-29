# Дорожная карта

План дальнейшей работы над ИТ-порталом 21vek. Приоритеты — по impact для production.

## Выполнено (baseline)

- OAuth Yandex 360 + domain gate
- Wiki reader (proxy, sanitize, scope, cache)
- Tracker demo mode
- Security hardening (CSRF, rate limits, Helmet, session hardening)
- Scale infrastructure (Redis, nginx static, 3 replicas, load tests)
- CI: unit tests, smoke, a11y, wiki parser audit
- **Epic 2 (2026-06-29):** Wiki split — [`yandexWiki.js`](../backend/src/auth/yandexWiki.js) facade + модули `wikiConfig`, `wikiApiClient`, `wikiSanitize`, `wikiRender`, `wikiAssets`, `wikiSearch`, `wikiTree`, `wikiTitles` (+ ранее `wikiMarkup`, `wikiScope`, `wikiCacheKeys`, `wikiAudit`)
- **Epic 3 (2026-06-29):** Strict CSP — `style-src 'self'` без `unsafe-inline`; Constructed Stylesheets ([`portal-dynamic-styles.js`](../js/portal-dynamic-styles.js)), ранний `auth.css`, data-attributes вместо inline styles

---

## Epic 1 — Yandex Tracker (production)

**Цель:** заменить demo mode реальной интеграцией с Yandex Tracker API.

**Текущее состояние:** `TRACKER_DEMO_MODE=true` обязателен в production (`validateSecurityConfig` блокирует `false`). API возвращает `DEMO-{timestamp}`.

**Задачи:**

1. OAuth scopes / service account для Tracker API
2. `POST /api/tracker/issues` → создание задачи в очереди ITHELP
3. `POST /api/tracker/password-reset` → workflow сброса пароля
4. Idempotency keys, retry, error mapping
5. UI: убрать demo banner, показ статуса заявки (опционально)
6. Обновить `validateSecurityConfig` — разрешить `TRACKER_DEMO_MODE=false` при настроенном Tracker
7. Тесты: mock Tracker API, smoke с реальным staging queue

**Файлы:** [`backend/src/routes/tracker.js`](../backend/src/routes/tracker.js), [`backend/src/tracker/validate.js`](../backend/src/tracker/validate.js), [`js/tracker.js`](../js/tracker.js)

**Owner:** Backend + IT Support

---

## Epic 4 — Observability

**Цель:** structured logging и метрики для production ops.

**Задачи:**

1. Pino вместо sampled `console.log` JSON
2. Metrics: request latency p50/p95, wiki cache hit rate, Redis connectivity
3. Optional: OpenTelemetry export

**Файлы:** [`backend/src/index.js`](../backend/src/index.js)

---

## Epic 5 — Security hardening (next)

| Задача | Priority |
|--------|----------|
| OAuth token refresh / shorter TTL policy | Medium |
| Proxy external wiki images через `/api/wiki/asset` | Low |
| Monitor `@diplodoc/transform` upstream CVEs | Medium |
| Merge `infra/scale-3000` → `main` | High |
| CI load test gate (optional, staging only) | Low |

---

## Epic 6 — Scale polish

**Задачи:**

1. nginx rate limit tuning под real traffic
2. Autoscaling policy для portal replicas (K8s/swarm)
3. Redis Sentinel / cluster для HA sessions

См. [SCALE.md](SCALE.md).

---

## Known issues (accepted)

| Issue | Severity | Workaround | Target epic |
|-------|----------|------------|-------------|
| Tracker demo only | Medium | Demo banner на главной | Epic 1 |
| OAuth token в session до 7d | Medium | Service token + purge | Epic 5 |
| diplodoc transitive CVEs | Medium | Transform timeout + max input | Epic 5 |
| Windows Node exit 4294967295 | Low | Restart / Linux prod | — |

---

## Как предлагать изменения

1. Issue/PR с ссылкой на epic
2. `npm run verify:security` в PR
3. Обновить docs при изменении API или env

См. [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [TESTING.md](TESTING.md).
