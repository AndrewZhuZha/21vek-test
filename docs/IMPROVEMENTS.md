# Backlog — ИТ-портал 21vek

Обновлено: 2026-06-26

| ID | P | Статус | Описание |
|----|---|--------|----------|
| CFG-01 | P1 | ⏳ | Актуализировать URL справочника (`phonebook`) в prod `config.local.js` |
| TRK-05 | P2 | ⏳ | Маппинг requestType → поля Tracker (backend-прокси) |
| UX-10 | P3 | ⏳ | SVG вместо emoji в разделах/карточках и переключателе темы |
| CFG-03 | P3 | ⏳ | Логотип [assets/logo-21vek.svg](../assets/logo-21vek.svg) в шапке |

## Backend (вне фронтенда)

- Proxy: `POST /api/tracker/issues`, `/api/tracker/password-reset`
- OAuth / service account для Tracker API
- В prod: `demoMode: false` в `config.local.js`

### Формат payload заявки

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

### Ожидаемый ответ API

```javascript
{ "issueKey": "ITHELP-123" }
```
