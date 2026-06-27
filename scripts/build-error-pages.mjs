import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errorsDir = join(root, 'errors');
const supportEmail = 'itsupport@21vek.by';
const portalBrand = 'IT-Support · 21VEK';

const errors = [
    {
        file: '400.html',
        code: '400',
        title: 'Неверный запрос',
        desc: 'Сервер не смог обработать запрос. Проверьте адрес или параметры и попробуйте снова.'
    },
    {
        file: '401.html',
        code: '401',
        title: 'Требуется авторизация',
        desc: 'Для доступа к этой странице нужны учётные данные. Войдите в систему или обратитесь в ИТ-поддержку.'
    },
    {
        file: '403.html',
        code: '403',
        title: 'Доступ запрещён',
        desc: 'У вас нет прав для просмотра этой страницы. Если доступ нужен по работе — напишите в ИТ-поддержку.'
    },
    {
        file: '404.html',
        code: '404',
        title: 'Страница не найдена',
        desc: 'Запрошенная страница не существует, была перемещена или удалена. Вернитесь на главную портала.'
    },
    {
        file: '500.html',
        code: '500',
        title: 'Внутренняя ошибка сервера',
        desc: 'На сервере произошла непредвиденная ошибка. Попробуйте обновить страницу позже или сообщите в поддержку.'
    },
    {
        file: '502.html',
        code: '502',
        title: 'Шлюз недоступен',
        desc: 'Промежуточный сервер не получил корректный ответ. Обычно это временно — повторите попытку через несколько минут.'
    },
    {
        file: '503.html',
        code: '503',
        title: 'Сервис временно недоступен',
        desc: 'Портал или связанный сервис временно недоступен из‑за обслуживания или высокой нагрузки.'
    },
    {
        file: '504.html',
        code: '504',
        title: 'Превышено время ожидания',
        desc: 'Сервер не дождался ответа вовремя. Проверьте соединение и попробуйте снова.'
    }
];

function buildSupportMailto(code) {
    const subject = encodeURIComponent(`ИТ-портал — ошибка ${code}`);
    const body = encodeURIComponent('Опишите, что произошло:\n\n');
    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
}

function renderPage(error) {
    const mailto = buildSupportMailto(error.code);

    return `<!DOCTYPE html>
<html lang="ru" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>${error.code} — ${error.title} | ${portalBrand}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <script src="/js/portal-theme-init.js"></script>
    <link rel="stylesheet" href="/css/variables.css">
    <link rel="stylesheet" href="/css/background.css">
    <link rel="stylesheet" href="/css/errors.css">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="page-bg" aria-hidden="true">
    <div class="page-bg__watermark">21vek.by</div>
    <div class="page-bg__blob page-bg__blob--1"></div>
    <div class="page-bg__blob page-bg__blob--2"></div>
</div>
<main class="error-page">
    <div class="error-page__panel">
        <p class="error-page__brand">${portalBrand}</p>
        <p class="error-page__code" aria-hidden="true">${error.code}</p>
        <h1 class="error-page__title">${error.title}</h1>
        <p class="error-page__desc">${error.desc}</p>
        <div class="error-page__actions">
            <a class="btn-primary" href="/">На главную</a>
            <a class="btn-secondary" href="${mailto}">Написать в поддержку</a>
        </div>
    </div>
</main>
</body>
</html>
`;
}

mkdirSync(errorsDir, { recursive: true });

errors.forEach(error => {
    writeFileSync(join(errorsDir, error.file), renderPage(error), 'utf8');
});

errors.forEach(error => {
    const legacyPath = join(root, error.file);
    if (existsSync(legacyPath)) {
        unlinkSync(legacyPath);
    }
});

console.log(`Generated ${errors.length} error pages in errors/`);
