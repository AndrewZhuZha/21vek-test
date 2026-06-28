# Настройка встроенной Wiki

Гибридный режим:

- читать статьи внутри портала: `/wiki/`;
- редактировать статьи в исходной Wiki: кнопка **«Редактировать в Wiki»**;
- обновлять индекс поиска по cron: `npm run refresh:wiki-search`.

## 1) Переменные окружения backend

Заполните `backend/.env`:

```env
YANDEX_WIKI_ENABLED=true
YANDEX_WIKI_OAUTH_TOKEN=
YANDEX_WIKI_ORG_ID=
YANDEX_WIKI_BASE_SLUG=homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov
YANDEX_WIKI_CACHE_TTL_SEC=300
YANDEX_WIKI_TREE_CACHE_TTL_SEC=300
YANDEX_WIKI_PAGE_CACHE_TTL_SEC=300
YANDEX_WIKI_SEARCH_CACHE_TTL_SEC=120
YANDEX_WIKI_REQUEST_TIMEOUT_MS=15000
YANDEX_WIKI_MAX_RESPONSE_BYTES=5242880
YANDEX_WIKI_DESCENDANTS_MAX=500
YANDEX_WIKI_EXTERNAL_URL=https://wiki.yandex.ru/homepage/otdel-texnicheskogo-soprovozhdenija/instrukcii/instrukcii-dlja-sotrudnikov/
```

`YANDEX_WIKI_ORG_ID` можно не указывать, если задан `YANDEX360_ORG_ID`.

## 2) Доступ OAuth

Для `YANDEX_WIKI_OAUTH_TOKEN` нужен OAuth-токен с правом чтения Wiki API.

1. Войдите в [oauth.yandex.ru](https://oauth.yandex.ru/).
2. Используйте сервисный аккаунт (или отдельное приложение для портала).
3. Выдайте scope для чтения Yandex Wiki API.
4. Сохраните токен в `backend/.env`.

## 3) Локальная проверка

```bash
npm run refresh:wiki-search
npm start
npm run verify:wiki
```

Проверка:

- `http://localhost:3000/wiki/` открывается;
- `GET /api/wiki/config-check` возвращает `enabled/configured` и `snapshot/cache` diagnostics;
- `GET /api/wiki/tree` без сессии возвращает `401`.

## 4) Cron на сервере

Пример (раз в 6 часов):

```cron
0 */6 * * * cd /opt/21vek-portal && /usr/bin/npm run refresh:wiki-search >> /var/log/portal-wiki-sync.log 2>&1
```

`refresh:wiki-search` уже включает `sync + build + validate` и не расходится по шагам между cron/CI.

## 5) Как это работает

- `/api/wiki/page` и `/api/wiki/tree` читают Wiki API через backend proxy.
- Контент кешируется (`memory` или `redis`, если `SESSION_STORE=redis`).
- `scripts/sync-wiki-index.mjs` обновляет `data/wiki-search.json` атомарно (tmp + rename).
- `scripts/build-search-index.mjs` подмешивает wiki-страницы в `window.PortalSearchIndex.wikiPages` тоже атомарно.
- Для дерева есть флаг `truncated`, если `YANDEX_WIKI_DESCENDANTS_MAX` ограничил выборку.

## Read-only контейнеры

Для `read_only: true` есть 2 валидных подхода:

1. **Bake artifacts в image**: запускать `npm run refresh:wiki-search` на CI до сборки Docker image.
2. **Volume/sidecar**: монтировать `/app/data` на writable volume и запускать refresh из cron/sidecar.

Смешивать подходы в одном окружении не рекомендуется.

## Rollback

1. Отключить встроенный reader: `YANDEX_WIKI_ENABLED=false`.
2. Перезапустить backend (`/wiki/` останется доступен как fallback на внешнюю Wiki).
3. Если причина в артефактах — вернуть предыдущий `data/wiki-search.json` и пересобрать `npm run build:search`.
4. После стабилизации снова включить `YANDEX_WIKI_ENABLED=true`.

## Troubleshooting

- `401/403` от Wiki API: проверьте `YANDEX_WIKI_OAUTH_TOKEN` и `YANDEX_WIKI_ORG_ID`.
- `Wiki reader отключён`: убедитесь, что `YANDEX_WIKI_ENABLED=true`.
- Пустая навигация: проверьте `YANDEX_WIKI_BASE_SLUG` и права токена на этот раздел.
