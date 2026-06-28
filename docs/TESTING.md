# Тестирование

Автоматические проверки и ручной чек-лист перед релизом.

## Быстрая проверка

```bash
npm run verify:security    # unit + auth smoke (рекомендуется перед каждым PR)
npm run verify:prod        # build + auth smoke
npm run audit:deps         # npm audit
```

## Автоматические тесты

### Unit (`test:backend`)

19 тестов в `backend/test/`:

| Файл | Покрытие |
|------|----------|
| `security-csrf.test.js` | CSRF Origin guard |
| `security-config.test.js` | Prod wiki token gate |
| `session-oauth.test.js` | OAuth token policy |
| `session-scope.test.js` | Conditional session |
| `scale-config.test.js` | Scale + redis validation |
| `wiki-security.test.js` | Scope guard |
| `wiki-asset-proxy.test.js` | Asset cache keys |
| `wiki-title.test.js` | Title resolution |

```bash
npm run test:backend
```

### HTTP smoke

| Скрипт | Checks | Env |
|--------|--------|-----|
| `verify:auth` | 45 — health, auth, wiki gate, static, CSRF dev | `PORTAL_URL` (default localhost:3000) |
| `verify:wiki` | Wiki config, tree, page | `WIKI_EXPECT_ENABLED=true/false` |
| `verify:a11y` | axe на `/` и `/wiki/` | Chrome/Chromium |
| `verify:security` | test:backend + verify:auth | — |
| `verify:prod` | build + verify:auth | — |

```bash
PORTAL_URL=http://127.0.0.1:3000 npm run verify:auth
PORTAL_URL=http://127.0.0.1:3000 WIKI_EXPECT_ENABLED=true npm run verify:wiki
```

### Wiki parser audit

```bash
npm run audit:wiki-parser
```

Синтетические тесты markup без live API. Полный аудит страниц: [guides/WIKI-QA.md](guides/WIKI-QA.md).

### CI

Workflow [`.github/workflows/ci-production-readiness.yml`](../.github/workflows/ci-production-readiness.yml):

- Wiki parser audit
- `test:backend`
- Start backend + `verify:prod`
- `verify:wiki` (disabled mode)
- axe a11y
- `audit:deps`

## Load tests

Требуется k6. См. [`scripts/loadtest/README.md`](../scripts/loadtest/README.md).

```bash
npm run loadtest:smoke
npm run loadtest:static
npm run loadtest:api
npm run loadtest:heavy    # 3000 VU
```

Критерии приёмки: [SCALE.md](SCALE.md).

## Ручной чек-лист перед релизом

### Авторизация

- [ ] Без сессии — gate «Войти через Яндекс»
- [ ] Вход @21vek.by — портал, аватар, ФИО в формах
- [ ] Logout — снова gate
- [ ] Email не @21vek.by — отказ
- [ ] `POST /api/tracker/issues` без сессии → 401

### Поиск и навигация

- [ ] Поиск фильтрует карточки, синонимы и раскладка работают
- [ ] Ctrl/Cmd+F и `/` фокусируют поле поиска
- [ ] Chip-навигация, кнопка «наверх»

### Формы

- [ ] Все типы открывают модалку с корректным заголовком
- [ ] `hr_new` — двухшаговый мастер
- [ ] Валидация обязательных полей, сброс пароля
- [ ] Demo submit: сообщение в модалке, нет двойного клика

### Модалки и a11y

- [ ] Escape / backdrop закрывают модалку
- [ ] Tab не выходит за пределы модалки
- [ ] Skip-link работает с клавиатуры

### Прочее

- [ ] Тема light/dark сохраняется
- [ ] Тур: первый визит, пропуск, `?tour=reset`
- [ ] URL «Полезное» ведут на ресурсы среды (`config.local.js`)
- [ ] Wiki `/wiki/` — дерево, страницы, картинки (если enabled)

## Wiki QA

Детальный playbook: [guides/WIKI-QA.md](guides/WIKI-QA.md).
