/** Вспомогательные функции валидации и отображения ошибок форм. */
window.PortalForm = (function () {
    const GLOBAL_ERROR_AUTO_HIDE_MS = 6000;
    let globalNoticeHideTimer = null;

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

    function clearGlobalNotice() {
        if (globalNoticeHideTimer) {
            clearTimeout(globalNoticeHideTimer);
            globalNoticeHideTimer = null;
        }
        const el = document.getElementById('portalGlobalNotice');
        if (!el) return;
        const messageEl = el.querySelector('.portal-global-notice__message');
        if (messageEl) {
            messageEl.textContent = '';
        } else {
            el.textContent = '';
        }
        el.className = 'portal-global-notice hidden';
    }

    function ensureGlobalNoticeEl() {
        const el = document.getElementById('portalGlobalNotice');
        if (!el) return null;

        let messageEl = el.querySelector('.portal-global-notice__message');
        let closeBtn = el.querySelector('.portal-global-notice__close');

        if (!messageEl || !closeBtn) {
            el.textContent = '';
            messageEl = document.createElement('span');
            messageEl.className = 'portal-global-notice__message';
            closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'portal-global-notice__close';
            closeBtn.setAttribute('aria-label', 'Закрыть уведомление');
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', clearGlobalNotice);
            el.append(messageEl, closeBtn);
        }

        return { el, messageEl };
    }

    function scheduleGlobalNoticeHide(timeoutMs = 0) {
        if (globalNoticeHideTimer) {
            clearTimeout(globalNoticeHideTimer);
            globalNoticeHideTimer = null;
        }
        if (!timeoutMs) return;
        globalNoticeHideTimer = window.setTimeout(() => {
            clearGlobalNotice();
        }, timeoutMs);
    }

    function showGlobalError(message) {
        const notice = ensureGlobalNoticeEl();
        if (!notice) return;
        const { el, messageEl } = notice;
        messageEl.textContent = message;
        el.className = 'portal-global-notice portal-global-notice--error';
        scheduleGlobalNoticeHide(GLOBAL_ERROR_AUTO_HIDE_MS);
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function showGlobalNotice(message) {
        const notice = ensureGlobalNoticeEl();
        if (!notice) return;
        const { el, messageEl } = notice;
        messageEl.textContent = message;
        el.className = 'portal-global-notice portal-global-notice--info';
        scheduleGlobalNoticeHide(0);
    }

    function showGlobalDemoNotice(message) {
        const notice = ensureGlobalNoticeEl();
        if (!notice) return;
        const { el, messageEl } = notice;
        messageEl.textContent = message;
        el.className = 'portal-global-notice portal-global-notice--demo';
        scheduleGlobalNoticeHide(0);
    }

    return {
        showError,
        showNotice,
        clearError,
        requireValue,
        showGlobalError,
        showGlobalNotice,
        showGlobalDemoNotice,
        clearGlobalNotice
    };
})();
