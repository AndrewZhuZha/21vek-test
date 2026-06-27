/** HTTP-клиент заявок в Яндекс Трекер (через backend proxy). */
window.PortalTracker = (function () {
    const DEFAULT_COOLDOWN_MS = 2500;

    let taskSubmitLocked = false;
    let resetSubmitLocked = false;
    let taskUnlockTimer = null;
    let resetUnlockTimer = null;

    function getConfig() {
        return window.PortalConfig || {};
    }

    function getGuestRequestTypes() {
        const guestRequestTypes = getConfig().auth?.guestRequestTypes;
        if (!Array.isArray(guestRequestTypes)) {
            return [];
        }
        return guestRequestTypes
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
    }

    function createAuthError(message) {
        const error = new Error(message);
        error.status = 401;
        error.needsLogin = true;
        error.loginUrl = getConfig().auth?.loginUrl || '/api/auth/login';
        return error;
    }

    function assertCanSubmit(requestType) {
        const auth = window.PortalAuth;
        if (auth?.isAuthenticated?.()) {
            return;
        }

        if (requestType && getGuestRequestTypes().includes(requestType)) {
            return;
        }

        throw createAuthError('Требуется авторизация. Войдите через Яндекс.');
    }

    function getCooldownMs() {
        const value = Number(getConfig().submitCooldownMs);
        return value > 0 ? value : DEFAULT_COOLDOWN_MS;
    }

    function createRequestId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function isTaskSubmitLocked() {
        return taskSubmitLocked;
    }

    function isResetSubmitLocked() {
        return resetSubmitLocked;
    }

    function lockTaskSubmit() {
        taskSubmitLocked = true;
        if (taskUnlockTimer) clearTimeout(taskUnlockTimer);
        taskUnlockTimer = window.setTimeout(() => {
            taskSubmitLocked = false;
            taskUnlockTimer = null;
        }, getCooldownMs());
    }

    function lockResetSubmit() {
        resetSubmitLocked = true;
        if (resetUnlockTimer) clearTimeout(resetUnlockTimer);
        resetUnlockTimer = window.setTimeout(() => {
            resetSubmitLocked = false;
            resetUnlockTimer = null;
        }, getCooldownMs());
    }

    function releaseTaskSubmitLock() {
        taskSubmitLocked = false;
        if (taskUnlockTimer) {
            clearTimeout(taskUnlockTimer);
            taskUnlockTimer = null;
        }
    }

    function releaseResetSubmitLock() {
        resetSubmitLocked = false;
        if (resetUnlockTimer) {
            clearTimeout(resetUnlockTimer);
            resetUnlockTimer = null;
        }
    }

    function setButtonLoading(button, loading, loadingText) {
        if (!button) return;

        if (loading) {
            if (!button.dataset.originalText) {
                button.dataset.originalText = button.textContent;
            }
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            if (loadingText) button.textContent = loadingText;
            return;
        }

        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }

    async function parseResponseBody(response) {
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            return { message: text.trim() };
        }
    }

    function buildIssueSuccessMessage(data) {
        const config = getConfig();
        const issueKey = data?.issueKey || data?.key || data?.id;
        if (!issueKey) return 'Заявка успешно создана.';

        let message = `Заявка ${issueKey} создана.`;
        const template = config.trackerIssueUrlTemplate;
        if (template && typeof template === 'string') {
            const url = template.replace('{issueKey}', encodeURIComponent(String(issueKey)));
            message += ` Открыть: ${url}`;
        }
        return message;
    }

    function extractErrorMessage(data, status) {
        if (status === 401) {
            return 'Сессия отсутствует или истекла. Войдите снова.';
        }
        if (!data) return `Ошибка сервера (${status}). Попробуйте позже.`;
        return data.message || data.error || data.detail || `Ошибка сервера (${status}).`;
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await parseResponseBody(response);
        if (!response.ok) {
            const error = new Error(extractErrorMessage(data, response.status));
            error.status = response.status;
            if (response.status === 401) {
                error.needsLogin = true;
                error.loginUrl = getConfig().auth?.loginUrl || '/api/auth/login';
            }
            throw error;
        }

        return data;
    }

    async function submitToTracker(payload) {
        const config = getConfig();
        assertCanSubmit(payload?.requestType);

        const url = config.trackerApiUrl;
        if (!url) {
            throw new Error('Не настроен trackerApiUrl. Укажите endpoint прокси в config.local.js.');
        }

        const body = {
            ...payload,
            clientRequestId: createRequestId()
        };

        const data = await postJson(url, body);
        return { demo: Boolean(data?.demo), data };
    }

    async function submitPasswordReset(payload) {
        const config = getConfig();
        assertCanSubmit('password_reset');

        const url = config.trackerResetApiUrl || config.trackerApiUrl;
        if (!url) {
            throw new Error('Не настроен trackerResetApiUrl. Укажите endpoint прокси в config.local.js.');
        }

        const body = {
            ...payload,
            clientRequestId: createRequestId()
        };

        const data = await postJson(url, body);
        return { demo: Boolean(data?.demo), data };
    }

    return {
        submitToTracker,
        submitPasswordReset,
        setButtonLoading,
        isTaskSubmitLocked,
        isResetSubmitLocked,
        lockTaskSubmit,
        lockResetSubmit,
        releaseTaskSubmitLock,
        releaseResetSubmitLock,
        buildIssueSuccessMessage
    };
})();
