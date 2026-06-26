/**
 * Перехват Ctrl/Cmd+F (и /) для фокуса на поиске портала.
 * Подключается первым в <head>, capture-фаза, до обработчиков браузера.
 */
(function () {
    'use strict';

    function isEditableTarget(target) {
        if (!target || !target.closest) return false;
        if (target.closest('.modal-overlay.active')) {
            const tag = target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (target.isContentEditable) return true;
        }
        return false;
    }

    function isPortalModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.active'));
    }

    function isFindHotkey(event) {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
        const key = event.key;
        const code = event.code;
        const keyCode = event.keyCode || event.which;
        return key === 'f'
            || key === 'F'
            || code === 'KeyF'
            || keyCode === 70;
    }

    function isSlashHotkey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        if (event.key !== '/' && event.code !== 'Slash' && event.keyCode !== 191) return false;
        return !isEditableTarget(event);
    }

    function focusPortalSearch() {
        const input = document.getElementById('cardSearch');
        if (input) {
            input.focus({ preventScroll: true });
        }
        window.dispatchEvent(new CustomEvent('portal:focus-search'));
    }

    function handleKeydown(event) {
        if (event.__portalSearchHotkeyHandled) return;

        const findHotkey = isFindHotkey(event);
        const slashHotkey = isSlashHotkey(event);
        if (!findHotkey && !slashHotkey) return;

        if (isPortalModalOpen() && isEditableTarget(event.target)) return;

        event.__portalSearchHotkeyHandled = true;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        event.returnValue = false;

        focusPortalSearch();
    }

    const options = { capture: true };

    function bind() {
        const root = document.documentElement;
        if (!root) return;
        root.addEventListener('keydown', handleKeydown, options);
        window.addEventListener('keydown', handleKeydown, options);
    }

    if (document.documentElement) {
        bind();
    } else {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    }
})();
