# План доработок ИТ-портала 21vek

Дополнительный документ к [README.md](../README.md). Актуальный backlog открытых задач.

**Последнее обновление:** 2026-06-26 — Sprint 3: стабильность и HTTP-слой Трекера.

### Статус пунктов

| Метка | Значение |
|-------|----------|
| ✅ | Выполнено |
| ⏳ | Открыто / в backlog |

---

## Текущее состояние

Статический портал: [index.html](../index.html), модули [js/](../js/), стили [css/](../css/).

Архитектура, порядок скриптов, контракты модулей — [docs/ARCHITECTURE.md](ARCHITECTURE.md).

Smoke-тесты перед релизом — [docs/SMOKE-TESTS.md](SMOKE-TESTS.md).

### Реализовано

- Конфиг-driven модель, умный поиск, модалки, темы, chip-навигация
- `request-types.json` + валидация сборки
- UX/a11y Sprint 2 (skip-link, inline search, scroll-to-top, design tokens, …)
- **HTTP-слой Трекера** ([js/tracker.js](../js/tracker.js)): `fetch`, loading UI, anti double-submit, custom events
- **Конфиг среды**: [js/config.local.js](../js/config.local.js) + [js/config.local.example.js](../js/config.local.example.js)
- npm-скрипты: `npm run build`

### Открытые задачи

| ID | P | Описание |
|----|---|----------|
| UX-10 | P3 | SVG вместо emoji |
| CFG-01 | P1 | Актуализировать placeholder URL (phonebook и т.д.) в prod |
| CFG-03 | P3 | Логотип в шапке |
| TRK-05 | P2 | Маппинг requestType → поля Tracker (**на стороне backend-прокси**) |

---

## 3. UI/UX — открыто

### UX-10 · P3 · SVG вместо emoji

Иконки разделов, карточек и переключателя темы — emoji. Заменить на SVG (`aria-hidden="true"`). [assets/logo-21vek.svg](../assets/logo-21vek.svg) — подключить в шапку.

**Файлы:** `index.html`, `assets/`, `css/style.css`.

---

## 6. Интеграция Яндекс Трекера

### Готово на фронтенде

| Элемент | Расположение |
|---------|--------------|
| Payload заявки / сброса пароля | `app.js` |
| HTTP-клиент | [js/tracker.js](../js/tracker.js) |
| Endpoint'ы, demoMode | [js/config.js](../js/config.js), [js/config.local.js](../js/config.local.js) |
| Anti double-submit | `tracker.js` + disabled submit |
| События аналитики | `portal:task-submitted`, `portal:task-failed` |
| Success UI с номером задачи | `tracker.buildIssueSuccessMessage()` |

### Остаётся для backend-команды

- Реализовать proxy `POST /api/tracker/issues` и `/api/tracker/password-reset`
- OAuth / service account для Tracker API
- Маппинг `requestType` → queue, component, priority (**TRK-05**)
- В prod: `demoMode: false` в `config.local.js`

#### Формат payload заявки

```javascript
{
  queue: 'ITHELP',
  summary: string,
  description: string,
  source: 'web-form',
  requestType: string,
  clientRequestId: string
}
```

#### Ожидаемый ответ API

```javascript
{ "issueKey": "ITHELP-123" }
```

---

## 7. Конфигурация — открыто

### CFG-01 · P1 · Актуализировать URL

Заменить placeholder `phonebook.company.ru` на реальный URL справочника в `config.local.js` для prod.

### CFG-03 · P3 · Логотип в шапке

Подключить [assets/logo-21vek.svg](../assets/logo-21vek.svg) рядом с «ИТ-портал 21Vek».

---

## Связанные документы

- [README.md](../README.md)
- [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/SMOKE-TESTS.md](SMOKE-TESTS.md)
- [errors/DEPLOY.md](../errors/DEPLOY.md)
- [data/request-types.json](../data/request-types.json)
- [data/search.overrides.json](../data/search.overrides.json)
