/** Человекочитаемые коды ошибок OAuth из URL (?auth_error=). */
(function () {
    const AUTH_ERROR_MESSAGES = {
        missing_code: 'Яндекс не вернул код авторизации. Попробуйте войти снова.',
        invalid_state: 'Сессия OAuth устарела или была прервана. Обновите страницу и войдите снова.',
        session_save_failed: 'Не удалось сохранить сессию на сервере. Попробуйте позже или обратитесь в IT.',
        domain_rejected: 'Доступ только для корпоративных учётных записей @21vek.by. Войдите через рабочий аккаунт Яндекс 360.',
        oauth_denied: 'Вход через Яндекс отменён или отклонён. Попробуйте снова.',
        oauth_failed: 'Не удалось завершить вход через Яндекс. Попробуйте позже.',
        auth_error: 'Не удалось выполнить вход. Попробуйте снова или обратитесь в IT.'
    };

    function humanizeAuthError(rawCode) {
        const code = String(rawCode || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, '_')
            .slice(0, 64);
        return AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.auth_error;
    }

    window.PortalAuthErrors = {
        humanize: humanizeAuthError
    };
})();
