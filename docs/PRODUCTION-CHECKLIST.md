# Production Checklist

Чек-лист готовности ИТ-портала к production. Основан на внутреннем аудите и внешних pre-launch практиках.

Статусы:
- `[x]` выполнено
- `[ ]` не выполнено
- `[ ] (partial)` частично выполнено

## A. Инфраструктура и домен (1-10)

- [ ] (partial) 1. Зафиксирован production URL и сверен с `PUBLIC_URL`.
- [ ] 2. DNS A/AAAA/CNAME настроены и проверены.
- [ ] 3. SSL-сертификат выпущен и проверен на срок действия.
- [ ] 4. HTTP принудительно редиректит на HTTPS.
- [ ] 5. Включён HSTS (`max-age>=15552000`, `includeSubDomains`).
- [ ] 6. Выбран канонический хост (www/non-www) и настроен редирект.
- [ ] 7. Настроен reverse proxy (nginx/IIS/Apache) для production.
- [ ] (partial) 8. Кастомные страницы 4xx/5xx подключены на прокси.
- [ ] 9. Настроен uptime-мониторинг `/api/health`.
- [ ] 10. Подготовлен rollback-план (образ, конфиг, DNS).

## B. Маршрутизация и статика (11-20)

- [x] 11. `/` отдаёт портал.
- [x] 12. Неизвестные URL отдают 404 вместо `index.html`.
- [x] 13. Пути к CSS/JS/assets сделаны абсолютными от `/`.
- [x] 14. Error pages корректно открываются на deep URL.
- [x] 15. Несуществующий static-файл возвращает короткий 404.
- [x] 16. Нет лишнего SPA fallback для любых URL.
- [x] 17. Favicon доступен по абсолютному пути.
- [x] 18. `robots.txt` настроен явно.
- [ ] 19. Решено, нужен ли `sitemap.xml` для этого портала.
- [ ] 20. Проверен deploy в subpath (если требуется).

## C. Backend / Node.js (21-30)

- [x] 21. `NODE_ENV=production` используется в prod-конфигурации.
- [x] 22. `SESSION_SECRET` валидируется и должен быть >= 32 символов.
- [x] 23. `YANDEX_OAUTH_TLS_INSECURE=true` блокируется в production.
- [ ] (partial) 24. `PUBLIC_URL` совпадает с боевым URL (проверка на стенде).
- [ ] (partial) 25. OAuth redirect URI сверен с настройками приложения Yandex.
- [x] 26. Добавлен глобальный error handler (API + HTML).
- [x] 27. Реализован graceful shutdown по SIGTERM/SIGINT.
- [x] 28. Включено HTTP-сжатие (compression).
- [x] 29. Добавлены cache-control правила для статики.
- [x] 30. Минимальное structured request logging (request id, method, path, status, duration).

## D. Авторизация OAuth (31-40)

- [x] 31. Запрашиваются нужные OAuth scopes (`login:*` + `directory:*`).
- [x] 32. Домен email ограничен (`21vek.by`).
- [x] 33. CSRF-проверка на state-changing запросах.
- [x] 34. После login выполняется `session.regenerate()`.
- [x] 35. OAuth access token не хранится в session.
- [x] 36. Лимиты на login/callback/logout.
- [x] 37. Добавлен лимит на `/api/auth/config-check`.
- [x] 38. Gate показывает сообщение о недоступности backend/auth.
- [x] 39. Logout чистит cookie с корректными флагами.
- [x] 40. Принято решение по session store (`memory|redis`, валидируется конфигом).

## E. Безопасность (41-52)

- [x] 41. Helmet/CSP включены.
- [x] 42. Cookie-флаги `httpOnly`, `secure`, `sameSite`.
- [x] 43. `.env` исключён из git.
- [x] 44. Секреты не хранятся в frontend-конфиге.
- [x] 45. `/api/auth/config-check` не раскрывает чувствительные данные в prod.
- [x] 46. `npm audit` заведён в CI.
- [x] 47. `GUEST_REQUEST_TYPES` по умолчанию пуст.
- [x] 48. Валидация payload на backend для tracker-эндпоинтов.
- [x] 49. Whitelist URL аватаров.
- [x] 50. Небезопасный TLS режим запрещён в production.
- [x] 51. Защита от clickjacking через `frame-ancestors`/`X-Frame`.
- [ ] 52. Отдельный security review / OWASP test перед релизом.

## F. Формы и Tracker (53-60)

- [x] 53. Формы технически проверяются smoke-скриптом (без логина).
- [x] 54. Демо-режим явно отображается в UI.
- [ ] 55. Реальная production интеграция с Tracker API.
- [ ] 56. Полный маппинг полей заявок в Tracker.
- [ ] (partial) 57. Password reset flow end-to-end на реальном Tracker.
- [x] 58. Проверка обязательных полей и ошибок на форме.
- [x] 59. Понятные сообщения об ошибке пользователю.
- [x] 60. `mailto` ссылки поддержки формируются корректно.

## G. Frontend и UX (61-70)

- [x] 61. Единый бренд-заголовок `IT-Support · 21VEK`.
- [x] 62. Убраны явные placeholder URL уровня `phonebook.company.ru`.
- [x] 63. Разные URL или автоскрытие дубля для `WIKI` и `Обучение`.
- [x] 64. Заглушки FAQ/Регламенты убраны из production UI.
- [x] 65. Логотип подключён в header и auth gate.
- [x] 66. Тур запускается только при корректной auth-сессии.
- [x] 67. Тема сохраняется и работает стабильно.
- [x] 68. Профиль показывает аватар, ФИО, email, должность (при наличии в Directory).
- [ ] (partial) 69. Мобильная вёрстка проверена на реальных устройствах.
- [ ] (partial) 70. Модалки проверены ручным чек-листом (focus trap, Escape).

## H. SEO и meta (71-78)

- [x] 71. Обновлён title страницы.
- [x] 72. Добавлен meta description.
- [x] 73. Добавлен `robots: noindex,nofollow`.
- [ ] 74. OG/Twitter cards (опционально для внутреннего портала).
- [ ] 75. Canonical URL (опционально).
- [x] 76. Один главный H1 на экране.
- [x] 77. `lang="ru"` на HTML.
- [ ] 78. Structured data (обычно N/A для intranet).

## I. Доступность WCAG 2.2 AA (79-90)

- [ ] (partial) 79. Контраст ключевых текстов проверен инструментально.
- [ ] (partial) 80. Focus-visible покрывает все интерактивные элементы.
- [ ] (partial) 81. Skip link протестирован с auth gate.
- [ ] (partial) 82. Полная клавиатурная навигация без мыши.
- [ ] (partial) 83. Проверены ARIA-атрибуты у всех кнопок/меню.
- [x] 84. Label привязан к каждому полю формы.
- [x] 85. Alt-тексты для значимых изображений/иконок.
- [ ] 86. Смысл не опирается только на emoji.
- [ ] (partial) 87. Touch targets >= 24x24 на мобильных.
- [x] 88. `prefers-reduced-motion` учтён.
- [ ] 89. Прогон NVDA/VoiceOver.
- [ ] 90. Авто-проверка axe без critical violations.

## J. Производительность (91-100)

- [ ] 91. LCP <= 2.5s (field/lab) на mobile.
- [ ] 92. CLS <= 0.1.
- [ ] 93. INP <= 200ms.
- [ ] 94. Mobile Lighthouse/PageSpeed >= 80.
- [ ] 95. Минификация/бандлинг CSS и JS.
- [ ] 96. Lazy/split загрузка тяжёлых JS (например search-index).
- [ ] (partial) 97. Оптимизация изображений (если добавляются растровые).
- [x] 98. `preconnect` для внешних доменов, если оправдано.
- [ ] 99. Service worker/offline стратегия (если нужна).
- [ ] 100. Lighthouse CI в пайплайне.

## K. Docker / CI / Deploy (101-110)

- [x] 101. В Dockerfile выполняется `npm run build`.
- [x] 102. Healthcheck без `wget` (через `node fetch`).
- [x] 103. Контейнер запускается не от root пользователя.
- [ ] (partial) 104. `.env` хранится только на сервере, с жёсткими правами.
- [x] 105. Есть `docker-compose` prod override/stack.
- [x] 106. CI на PR с quality gates.
- [x] 107. В CI запускается production smoke (`npm run verify:prod`).
- [ ] (partial) 108. Есть staging окружение, близкое к prod.
- [ ] 109. Секреты и backup вынесены в vault/безопасное хранилище.
- [ ] 110. Ведутся changelog/release notes.

## L. Тестирование и QA (111-120)

- [x] 111. Автоматический smoke auth/checks есть.
- [ ] (partial) 112. Чек-лист `docs/SMOKE-TESTS.md` прогоняется перед релизом.
- [ ] (partial) 113. OAuth login @21vek.by прогнан на staging/prod.
- [ ] (partial) 114. Logout + повторный вход проверены вручную.
- [x] 115. Проверен сценарий F5 без неавторизованного flash-контента.
- [x] 116. Авто-проверки охватывают 404 и form API маршруты.
- [ ] 117. Cross-browser smoke (Chrome/Edge/Firefox).
- [ ] 118. iOS Safari smoke.
- [ ] 119. E2E тесты Playwright/Cypress.
- [ ] 120. Нагрузочный тест и проверка rate-limit политики.

## Базовые команды проверки

```bash
npm run build
npm run verify:prod
npm run verify:a11y
npm run audit:deps
```

## Текущий приоритет

1. Реальная интеграция Tracker API (или формальное решение оставить demo-only).
2. Держать обязательные CI quality gates (`verify:prod`, `verify:a11y`, `audit:deps`) в зелёном статусе.
3. Настроить production окружение (HTTPS, DNS, reverse proxy, monitoring).
