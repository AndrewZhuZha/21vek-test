# Настройка встроенной Wiki

Гибридный режим:

- читать статьи внутри портала: `/wiki/`;
- редактировать в исходной Wiki: кнопка **«Редактировать в Wiki»**;
- обновлять индекс поиска по cron: `npm run refresh:wiki-search`.

## 1. Переменные окружения

Заполните `backend/.env`:

```env
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=       # service token обязателен в production
YANDEX_WIKI_ORG_ID=
YANDEX_WIKI_BASE_SLUG=homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov
YANDEX_WIKI_BASE_TITLE=Инструкции для сотрудников
YANDEX_WIKI_CACHE_TTL_SEC=300
YANDEX_WIKI_EXTERNAL_URL=https://wiki.yandex.ru/homepage/.../
```

`YANDEX_WIKI_ORG_ID` можно не указывать, если задан `YANDEX360_ORG_ID`.

Полный список: [`backend/.env.example`](../../backend/.env.example).

## 2. OAuth и токены

### Delegated auth (dev, без service token)

1. В OAuth-приложении добавьте scope **`wiki:read`** ([AUTH-SETUP.md](AUTH-SETUP.md)).
2. Выйдите и войдите в портал заново.
3. Wiki API использует OAuth token из session.

### Service token (production, scale)

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → service account / debug token.
2. Scope **`wiki:read`**.
3. Сохраните в `YANDEX_WIKI_OAUTH_TOKEN`.

В production `validateSecurityConfig()` **требует** service token при `YANDEX_WIKI_ENABLED=true`.

## 3. Локальная проверка

```bash
npm run refresh:wiki-search
npm start
npm run verify:wiki
```

Проверка:

- `http://localhost:3000/wiki/` открывается;
- `GET /api/wiki/config-check` → `enabled`, `configured`;
- `GET /api/wiki/tree` без сессии → `401`.

## 4. Как это работает

- `/api/wiki/page`, `/api/wiki/tree` — proxy к Wiki API через backend.
- Контент кэшируется (memory + Redis при `SESSION_STORE=redis`).
- `scripts/sync-wiki-index.mjs` → `data/wiki-search.json` (atomic write).
- `scripts/build-search-index.mjs` → wiki pages в `PortalSearchIndex`.
- Дерево: флаг `truncated` при `YANDEX_WIKI_DESCENDANTS_MAX`.

Архитектура: [ARCHITECTURE.md](../ARCHITECTURE.md).

## 5. Cron

```cron
0 */6 * * * cd /opt/21vek-test && npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1
15 */6 * * * cd /opt/21vek-test && npm run warm:wiki-cache >> /var/log/portal-wiki-warm.log 2>&1
```

Подробнее: [OPERATIONS.md](../OPERATIONS.md).

## Read-only Docker

1. **Bake artifacts в image** — `refresh:wiki-search` на CI до `docker build`.
2. **Writable volume** на `/app/data` + cron.

Не смешивать подходы в одном окружении.

## Rollback

1. `YANDEX_WIKI_ENABLED=false` → restart.
2. Откат `data/wiki-search.json` → `npm run build:search`.
3. Проверить fallback на внешнюю Wiki.

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| 401/403 Wiki API | Token, org ID, scope `wiki:read`, re-login |
| Reader disabled | `YANDEX_WIKI_ENABLED=true`, restart |
| Пустая навигация | `YANDEX_WIKI_BASE_SLUG`, права токена |
| 502 на assets | TLS, лог backend |

Parser QA: [WIKI-QA.md](WIKI-QA.md).
