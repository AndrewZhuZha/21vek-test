# Проверка Wiki перед продом

Инструкция для разработчика и для AI-агента: как автоматически находить ошибки парсинга Yandex Wiki.

## 1. Подготовка (один раз)

### OAuth scope

1. Откройте [oauth.yandex.ru](https://oauth.yandex.ru/) → приложение портала (`YANDEX_CLIENT_ID` из `backend/.env`).
2. В **Permissions / Scopes** добавьте **`wiki:read`**.
3. Redirect URI: `http://localhost:3000/api/auth/callback` (или ваш `PUBLIC_URL` + `/api/auth/callback`).

### Перелогин

1. Запустите портал: `npm start`.
2. Откройте `http://localhost:3000` → **Выйти** → **Войти через Яндекс** снова.
3. Убедитесь, что `GET /api/wiki/tree` в Network → **200** (не 401/403).

`YANDEX_WIKI_OAUTH_TOKEN` в `.env` **не обязателен** — достаточно delegated auth через сессию после входа.

---

## 2. Быстрая проверка парсера (без API)

Синтетические тесты: цвета, kbd, tree, ipconfig, картинки.

```powershell
cd d:\ПОРТАЛЫ\21vek-test
npm run audit:wiki-parser
```

Или:

```powershell
cd d:\ПОРТАЛЫ\21vek-test\backend
node scripts/wiki-verify.mjs
```

Ожидание: exit code **0**, все строки `OK`.

---

## 3. Полный аудит всех страниц (нужна сессия)

### Вариант A — из браузера (рекомендуется)

После входа в портал откройте `/wiki/`, DevTools → Console:

```javascript
fetch('/api/wiki/audit')
  .then((r) => r.json())
  .then((data) => {
    console.log('scanned:', data.scanned, 'issues:', data.issueCount);
    console.table(data.report.map((x) => ({ title: x.title, issues: x.issues.join('; ') })));
    return data;
  });
```

Скопируйте JSON (`report`) в чат агенту — он исправит парсер по списку.

Опции:

- `fetch('/api/wiki/audit?limit=10')` — первые 10 страниц (быстрый прогон).
- `fetch('/api/wiki/audit?probeAssets=false')` — без проверки загрузки картинок.

### Вариант B — CLI с сервисным токеном

Если есть `YANDEX_WIKI_OAUTH_TOKEN` в `backend/.env`:

```powershell
cd d:\ПОРТАЛЫ\21vek-test\backend
node scripts/wiki-audit.mjs
node scripts/wiki-audit.mjs --limit=20
node scripts/wiki-audit.mjs --no-assets
```

Отчёт: `tmp-wiki-audit.json`.

---

## 4. Что проверяет аудит

| Проблема | Пример |
|----------|--------|
| Сырой `{% tree %}` | раздел «Камеры» |
| Сырой `{blue}(...)` | HikCentral |
| Экранированный `<kbd>` | «Имя компьютера» |
| Сырой `++...++` | инструкции с клавишами |
| Legacy картинки `.files/` | старые страницы |
| `yfm-line-number` | вывод ipconfig |
| Asset 404 | «Изображение недоступно» |

Каждая запись в `report` содержит:

- `slug`, `title`, `issues[]`
- `rawSnippet` — исходник из Wiki API
- `htmlSnippet` — фрагмент HTML с ошибкой

---

## 5. Workflow для агента

```text
1. npm run audit:wiki-parser          → синтетика OK?
2. fetch('/api/wiki/audit')            → report пустой?
3. Если есть issues → правки yandexWiki.js / wikiMarkup.js
4. Повтор шагов 1–2 до issueCount = 0
5. Ctrl+F5 на /wiki/ + 3 эталонные страницы:
   - «Как узнать IP»
   - HikCentral / SmartPSS
   - «Где посмотреть Имя Компьютера?»
```

---

## 6. Точечная диагностика

Страница:

```javascript
fetch('/api/wiki/page?slug=homepage/.../gde-posmotret-imja-kompjutera')
  .then((r) => r.json())
  .then((d) => console.log(d.html.slice(0, 800)));
```

Вложения (CLI, нужен токен):

```powershell
node backend/scripts/wiki-probe.mjs "homepage/.../slug" [oauth_token]
```

---

## 8. Изображения не загружаются (502 / «Изображение недоступно»)

### Delegated auth (без токена в .env) — ваш случай

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → приложение портала → добавить scope **`wiki:read`**.
2. **Выйти** из портала → **Войти через Яндекс** снова (старый token без wiki:read не обновится сам).
3. `Ctrl+F5` на `/wiki/`.
4. В Network проверьте `/api/wiki/asset` — должен быть **200**, не 403/502.

Если **403** — нет scope или нужен re-login.  
Если **502** — смотрите лог backend (`Wiki asset fetch failed`); часто это TLS (dev: `YANDEX_OAUTH_TLS_INSECURE=true` уже в `.env`).

### Сервисный токен (опционально, для CLI-скриптов)

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → ваше приложение.
2. Раздел **«Отладка» / Debug token** → scope **`wiki:read`** → получить token.
3. Вставить в `backend/.env`: `YANDEX_WIKI_OAUTH_TOKEN=...`
4. Перезапустить `npm start`.

Для повседневного чтения Wiki в браузере сервисный токен **не нужен** — достаточно входа в портал.

---

## 7. Перед продом

1. Убедиться, что в oauth.yandex.ru на prod-приложении тоже есть `wiki:read`.
2. Прогнать `npm run audit:wiki-parser`.
3. Прогнать `/api/wiki/audit` на staging.
4. После деплоя — hard refresh (`Ctrl+F5`) на `/wiki/`.

Кэш страниц сбрасывается при bump версии в `getWikiPagePayload` (`page:vN:`). После правок парсера нужен refresh в браузере.
