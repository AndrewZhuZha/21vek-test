# Security Assessment — IT-портал 21vek (Wiki + Portal)

**Дата:** 2026-06-28 · **Версия:** 2.0 (post-hardening)

## Executive summary

После второго цикла hardening модуль **Wiki + Portal** соответствует корпоративным требованиям для internal-only deployment за reverse proxy с HTTPS, Redis sessions и Yandex OAuth.

| Область | Оценка | Комментарий |
|---------|--------|-------------|
| Authentication | **A** | OAuth state, domain gate, session regenerate |
| Authorization (Wiki) | **A-** | Scope guard page/asset; per-user cache |
| XSS | **A-** | Server sanitize + safe unescape + client strip |
| SSRF | **A** | Host allowlist + redirect validation |
| CSRF | **B+** | Origin-only на POST (достаточно для текущего API) |
| Info disclosure | **A-** | Public health минимален; /data заблокирован |
| Rate limiting | **A-** | Auth, wiki, health |
| Session | **B+** | Redis рекомендован в prod; token в session |

---

## Исправлено в цикле 2 (110%)

### Critical / High
- **Asset cache IDOR** — ключ `asset:v2:{authHash}:{path}` (`wikiCacheKeys.js`)
- **Stored XSS via entity unescape** — `safeUnescapeWikiTags()` + финальный `sanitizeAndRewriteHtml()`
- **Public `/data/*`** — HTTP 404, snapshot только через backend FS
- **OAuth PII in URL** — opaque codes (`domain_rejected`, `oauth_failed`, …)

### Medium
- **`/api/health`** — публично только `{ ok, service }`; details → `/api/health/details` (auth)
- **`/api/wiki/config-check`** — без snapshot/cache/baseSlug
- **Wiki API errors** — generic message в production
- **Sanitizer allowlist** — убраны global `data-*` и `id`
- **Client sanitizer** — блок svg/math/style, vbscript/data:text/html
- **Rate limit** — `/api/health`

### Performance / UX
- **CSS bundles** — `portal.bundle.css`, `wiki.bundle.css` (1 HTTP вместо 12)
- **Lazy search-index** — загрузка после idle / focus
- **OAuth errors** — человекочитаемые сообщения (`js/auth/errors.js`)
- **Wiki disabled** — notice на портале при fallback на external

### CI / Tests
- `audit:wiki-parser`, `test:backend`, `verify:wiki` (disabled), axe на `/` + `/wiki/`

---

## Оставшиеся риски (accepted / roadmap)

| Риск | Severity | Mitigation |
|------|----------|------------|
| OAuth token 7d в session | Medium | Redis + service token для Wiki; re-login policy |
| CSP `unsafe-inline` styles | Low | Critical CSS externalized позже |
| Tracker demo in prod | Low | Отдельный epic; UI banner |
| External wiki images (не proxy) | Low | CSP img-src allowlist |
| `yandexWiki.js` monolith | Maintainability | Incremental split |

---

## Production checklist

```bash
SESSION_STORE=redis
SESSION_SECRET=<32+ random bytes>
SESSION_REDIS_URL=redis://...
PUBLIC_URL=https://portal.example.com
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_AUDIT_ENABLED=false
npm run build && npm run verify:prod && npm run test:backend
```

---

## OWASP ASVS mapping (выборочно)

| ASVS | Control | Status |
|------|---------|--------|
| V2 | Session management | ✅ httpOnly, secure, regenerate |
| V3 | Access control | ✅ Wiki scope + auth |
| V5 | Validation | ✅ slug/query limits |
| V8 | Data protection | ✅ /data blocked, PII out of URLs |
| V10 | Malicious code | ✅ sanitize-html + CSP |
| V13 | API | ✅ rate limits, auth |

См. также: [REFACTORING-PLAN.md](./REFACTORING-PLAN.md), [DEPLOY.md](./DEPLOY.md), [ARCHITECTURE.md](./ARCHITECTURE.md).
