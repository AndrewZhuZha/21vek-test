# Проверка Wiki перед продом

Playbook для разработчика и AI-агента: автоматический поиск ошибок парсинга Yandex Wiki.

## 1. Подготовка

### OAuth scope

1. [oauth.yandex.ru](https://oauth.yandex.ru/) → приложение портала.
2. Добавьте **`wiki:read`** в Permissions.
3. Redirect URI: `{PUBLIC_URL}/api/auth/callback`.

### Перелогин

1. `npm start`
2. Выйти → Войти через Яндекс.
3. `GET /api/wiki/tree` в Network → **200**.

`YANDEX_WIKI_OAUTH_TOKEN` не обязателен для браузера — достаточно delegated auth через session.

---

## 2. Быстрая проверка парсера (без API)

```bash
npm run audit:wiki-parser
```

Или:

```bash
node backend/scripts/wiki-verify.mjs
```

Ожидание: exit code **0**, все строки `OK`.

---

## 3. Полный аудит страниц

### Вариант A — браузер (рекомендуется)

После входа, DevTools → Console:

```javascript
fetch('/api/wiki/audit')
  .then((r) => r.json())
  .then((data) => {
    console.log('scanned:', data.scanned, 'issues:', data.issueCount);
    console.table(data.report.map((x) => ({ title: x.title, issues: x.issues.join('; ') })));
  });
```

Опции:

- `?limit=10` — быстрый прогон
- `?probeAssets=false` — без проверки картинок

Требует `YANDEX_WIKI_AUDIT_ENABLED=true` в dev или auth + enabled endpoint.

### Вариант B — CLI (service token)

```bash
cd backend
node scripts/wiki-audit.mjs
node scripts/wiki-audit.mjs --limit=20
node scripts/wiki-audit.mjs --no-assets
```

Отчёт: `tmp-wiki-audit.json` (gitignored).

---

## 4. Что проверяет аудит

| Проблема | Пример |
|----------|--------|
| Сырой `{% tree %}` | раздел «Камеры» |
| Сырой `{blue}(...)` | HikCentral |
| Экранированный `<kbd>` | «Имя компьютера» |
| Сырой `++...++` | инструкции с клавишами |
| Legacy `.files/` images | старые страницы |
| `yfm-line-number` | вывод ipconfig |
| Asset 404 | «Изображение недоступно» |

Запись в `report`: `slug`, `title`, `issues[]`, `rawSnippet`, `htmlSnippet`.

---

## 5. Workflow для агента

```text
1. npm run audit:wiki-parser          → синтетика OK?
2. fetch('/api/wiki/audit')            → issueCount = 0?
3. Если issues → правки yandexWiki.js / wikiMarkup.js
4. Повтор 1–2
5. Ctrl+F5 на /wiki/ + эталонные страницы
```

---

## 6. Точечная диагностика

Страница:

```javascript
fetch('/api/wiki/page?slug=homepage/.../slug')
  .then((r) => r.json())
  .then((d) => console.log(d.html.slice(0, 800)));
```

CLI (нужен token):

```bash
node backend/scripts/wiki-probe.mjs "homepage/.../slug" [oauth_token]
```

---

## 7. Изображения не загружаются

### Delegated auth

1. Scope **`wiki:read`** в OAuth app.
2. Re-login (старый token без scope не обновится).
3. `Ctrl+F5` на `/wiki/`.
4. Network: `/api/wiki/asset` → **200**.

403 — нет scope или re-login. 502 — лог backend, TLS.

### Service token (CLI / scale)

1. Debug token с `wiki:read` → `YANDEX_WIKI_OAUTH_TOKEN`.
2. Restart `npm start`.

Для браузера service token не обязателен.

---

## 8. Перед продом

1. Scope `wiki:read` на prod OAuth app.
2. `npm run audit:wiki-parser`
3. `/api/wiki/audit` на staging
4. Hard refresh после деплоя

Кэш страниц: bump версии в cache key после правок парсера.

См. [WIKI-SETUP.md](WIKI-SETUP.md), [TESTING.md](../TESTING.md).
