/** Вспомогательные функции валидации и отображения ошибок форм. */
window.PortalForm = (function () {
    function ensureErrorEl(form) {
        let el = form.querySelector('.form-error');
        if (!el) {
            el = document.createElement('div');
            el.className = 'form-error';
            el.setAttribute('role', 'alert');
            el.setAttribute('aria-live', 'polite');
            const actions = form.querySelector('.modal-actions');
            if (actions) {
                form.insertBefore(el, actions);
            } else {
                form.appendChild(el);
            }
        }
        return el;
    }

    function showError(form, message) {
        const el = ensureErrorEl(form);
        el.className = 'form-error';
        el.textContent = message;
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function showNotice(form, message) {
        const el = ensureErrorEl(form);
        el.className = 'form-notice';
        el.textContent = message;
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function clearError(form) {
        const el = form.querySelector('.form-error, .form-notice');
        if (el) el.textContent = '';
    }

    function requireValue(value, message) {
        return value?.trim() ? null : message;
    }

    return { showError, showNotice, clearError, requireValue };
})();
