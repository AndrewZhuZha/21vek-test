# План рефакторинга IT-портала 21vek

**Версия:** 2.0 · **Дата:** 2026-06-28  
**Scope:** Wiki + Portal → 110% (security hardening + perf + CI)

---

## Статус: ✅ 110% (Wiki + Portal)

| Фаза | Статус |
|------|--------|
| 1 Wiki security + function | ✅ |
| 2 Portal perf + UX | ✅ |
| 3 Security / UI / UX audit | ✅ |
| 4 Cleanup + architecture | ✅ (partial yandexWiki split deferred) |
| 5 CI + automated acceptance | ✅ |
| **6 Security cycle 2** | ✅ |

Полный отчёт: [SECURITY-AUDIT.md](./SECURITY-AUDIT.md)

---

## Фаза 6 — Security & 110% (2026-06-28)

### Безопасность
- [x] Asset cache per-user (`asset:v2:{authHash}:…`)
- [x] XSS: safe entity unescape + re-sanitize
- [x] Block public `/data/*`
- [x] OAuth opaque error codes + humanized UI
- [x] Split `/api/health` vs `/api/health/details`
- [x] Minimal `/api/wiki/config-check`
- [x] Prod Wiki API errors sanitized
- [x] Tightened sanitizer allowlist
- [x] Enhanced client sanitizer
- [x] Health rate limit + Permissions-Policy

### Performance
- [x] CSS bundles (`portal.bundle.css`, `wiki.bundle.css`)
- [x] Lazy search-index loader
- [x] CSS preload

### CI / Tests
- [x] `test:backend` (wiki scope + cache keys)
- [x] `audit:wiki-parser` in CI
- [x] `verify:wiki` disabled mode in CI
- [x] Axe on `/` + `/wiki/`

---

## Отложено (не блокирует prod)

- Split `yandexWiki.js` (~2100 lines)
- CSP без `unsafe-inline` (needs critical CSS externalization)
- Yandex Tracker API integration
- Pino structured logging

---

## Команды приёмки

```bash
npm run build
npm run test:backend
npm run verify:prod
npm run audit:wiki-parser
npm run verify:a11y    # нужен Chrome
npm run audit:deps
```
