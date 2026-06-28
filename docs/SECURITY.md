# Безопасность

Модель безопасности internal-only портала за reverse proxy с HTTPS, Redis sessions и Yandex OAuth.

**Дата актуализации:** 2026-06-29

## Posture (оценки)

| Область | Оценка | Комментарий |
|---------|--------|-------------|
| Authentication | A | OAuth state, domain gate, session regenerate |
| Authorization (Wiki) | A- | Scope guard; per-user asset cache |
| XSS | A- | Server sanitize + client strip |
| SSRF | A | Host allowlist + redirect validation |
| CSRF | B+ | Origin/Referer на POST (достаточно для текущего API) |
| Info disclosure | A- | Public health минимален; `/data` заблокирован |
| Rate limiting | A- | Auth, wiki, tracker, health |
| Session | A- | Redis в prod; OAuth token purge; rolling cookie |

## Controls

### Transport и headers

- Helmet: CSP, HSTS (prod), CORP `same-origin`, referrerPolicy, Permissions-Policy
- `dnsPrefetchControl: off`
- API `/api/auth`, `/api/tracker`: `Cache-Control: no-store`
- HTML: `no-store`; bundles: `max-age=3600` (versioned → immutable)

### Authentication

- Yandex OAuth 360, domain gate `@21vek.by`
- `session.regenerate()` после login
- Opaque error codes в URL (`domain_rejected`, `oauth_failed`, …)
- Directory enrichment опционально; defer в scale mode

### Session и OAuth token

- Cookie `portal.sid`: `httpOnly`, `secure` (prod), `sameSite: lax`
- Session middleware **только для `/api/*`** — статика без session I/O
- OAuth access token: не хранится при Wiki service token + без Directory; purge после Directory ([`sessionOAuth.js`](../backend/src/auth/sessionOAuth.js))
- `SESSION_MAX_AGE_DAYS` (default 7)

### CSRF

`POST /api/auth/logout`, `POST /api/tracker/*` — проверка `Origin`/`Referer` против `PUBLIC_URL`. Unit-тесты: `backend/test/security-csrf.test.js`.

### Wiki

- Scope guard: только `baseSlug` и descendants
- SSRF: allowlist хостов Wiki API
- XSS: `sanitize-html` + safe unescape + client sanitizer
- Asset cache keys: `asset:v2:{authHash}:…` (нет IDOR)
- Transform DoS guard: timeout + max input chars
- `/api/wiki/config-check` — без snapshot/cache internals

### Rate limiting

Per-route limiters в [`rateLimit.js`](../backend/src/middleware/rateLimit.js). Scale mode — повышенные лимиты через env.

### Data protection

- `/data/*` → HTTP 404
- `/api/health` — только `{ ok, service }`; details требуют auth
- Wiki API errors — generic message в production

## Production gates

`validateSecurityConfig()` при старте ([`config.js`](../backend/src/config.js)):

| Условие | Действие |
|---------|----------|
| `NODE_ENV=production` + короткий `SESSION_SECRET` | throw |
| `PUBLIC_URL` не https | throw |
| `YANDEX_OAUTH_TLS_INSECURE=true` | throw |
| `RATE_LIMIT_SCALE_MODE=true` + `SESSION_STORE=memory` | throw |
| `YANDEX_WIKI_ENABLED=true` без service token | throw |
| `TRACKER_DEMO_MODE=false` | throw (API не реализован) |

## Accepted risks

| Риск | Severity | Mitigation / roadmap |
|------|----------|----------------------|
| OAuth token до 7d в session | Medium | Service token + purge; см. [ROADMAP.md](ROADMAP.md) |
| CSP `unsafe-inline` styles | Low | Externalize critical CSS |
| Tracker demo in prod | Low | Demo banner; prod API в roadmap |
| External wiki images | Low | CSP img-src allowlist |
| `@diplodoc/transform` transitive CVEs | Medium | Timeout + max input; monitor upstream |
| `yandexWiki.js` monolith | Maintainability | Incremental split |

## Production checklist

```bash
SESSION_STORE=redis
SESSION_SECRET=<32+ random bytes>
SESSION_REDIS_URL=redis://...
PUBLIC_URL=https://portal.example.com
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=<service token>
YANDEX_WIKI_AUDIT_ENABLED=false

npm run build
npm run verify:security
```

## OWASP ASVS (выборочно)

| ASVS | Control | Status |
|------|---------|--------|
| V2 | Session management | ✅ httpOnly, secure, regenerate |
| V3 | Access control | ✅ Wiki scope + auth |
| V5 | Validation | ✅ slug/query limits |
| V8 | Data protection | ✅ /data blocked, PII out of URLs |
| V10 | Malicious code | ✅ sanitize-html + CSP |
| V13 | API | ✅ rate limits, auth |

## Тестирование

```bash
npm run verify:security   # 19 unit + 45 smoke
npm run audit:wiki-parser
npm run audit:deps
```

Подробнее: [TESTING.md](TESTING.md).

См. также: [DEPLOY.md](DEPLOY.md), [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md).
