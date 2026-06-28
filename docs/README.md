# Документация ИТ-портала 21vek

## С чего начать

| Роль | Документ |
|------|----------|
| Разработчик | [DEVELOPMENT.md](DEVELOPMENT.md) → [guides/AUTH-SETUP.md](guides/AUTH-SETUP.md) |
| DevOps / деплой | [DEPLOY.md](DEPLOY.md) → [OPERATIONS.md](OPERATIONS.md) |
| Scale / нагрузка | [SCALE.md](SCALE.md) |
| Security review | [SECURITY.md](SECURITY.md) |
| QA перед релизом | [TESTING.md](TESTING.md) |
| Планирование | [ROADMAP.md](ROADMAP.md) |

## Полный указатель

| Документ | Содержание |
|----------|------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Системная архитектура: backend, frontend, data, Docker |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Локальная разработка, npm-скрипты, добавление услуг |
| [DEPLOY.md](DEPLOY.md) | Production deploy: env, Docker, nginx, systemd |
| [OPERATIONS.md](OPERATIONS.md) | Cron, мониторинг, Redis, troubleshooting |
| [SCALE.md](SCALE.md) | Масштабирование до 3000 пользователей |
| [SECURITY.md](SECURITY.md) | Модель безопасности, prod checklist |
| [TESTING.md](TESTING.md) | Автотесты, loadtest, ручной smoke |
| [ROADMAP.md](ROADMAP.md) | Дорожная карта: Tracker, Wiki split, observability |

### Guides

| Документ | Содержание |
|----------|------------|
| [guides/AUTH-SETUP.md](guides/AUTH-SETUP.md) | Yandex OAuth 360 |
| [guides/WIKI-SETUP.md](guides/WIKI-SETUP.md) | Встроенная Wiki |
| [guides/WIKI-QA.md](guides/WIKI-QA.md) | QA Wiki-парсера |

### Вне docs/

| Документ | Содержание |
|----------|------------|
| [../README.md](../README.md) | Обзор проекта, быстрый старт |
| [../errors/DEPLOY.md](../errors/DEPLOY.md) | Error pages в nginx/IIS |
| [../scripts/loadtest/README.md](../scripts/loadtest/README.md) | k6 load tests |

## Ключевые команды

```bash
npm start
npm run verify:security
npm run build
```

Корень проекта: [../README.md](../README.md).
