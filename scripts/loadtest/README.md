# Нагрузочные тесты (k6)

Сценарии для проверки масштабирования до ~3000 одновременных пользователей.

## Требования

- [k6](https://k6.io/docs/get-started/installation/) установлен локально или в CI
- Портал запущен (рекомендуется scale-стек из `docs/SCALE-3000.md`)

## Переменные

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORTAL_URL` | `http://127.0.0.1:3000` | Базовый URL портала |
| `K6_VUS` | `3000` | Виртуальные пользователи |
| `K6_DURATION` | `30s` | Длительность прогона |

## Сценарии

```bash
# Быстрый smoke без k6 (100 параллельных запросов)
npm run loadtest:smoke

# Статика (CSS/JS/assets) — основной пик при thundering herd
PORTAL_URL=http://127.0.0.1:8080 k6 run scripts/loadtest/portal-static.js

# API auth/me (без cookie — ожидаются 401, важны latency и отсутствие 429)
k6 run scripts/loadtest/portal-api.js

# Wiki read (нужна сессия — см. WIKI_SESSION_COOKIE)
WIKI_SESSION_COOKIE="portal.sid=..." k6 run scripts/loadtest/wiki-read.js
```

## Критерии приёмки

См. [docs/SCALE-3000.md](../../docs/SCALE-3000.md).
