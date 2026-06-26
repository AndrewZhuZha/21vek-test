/** Управление модальными окнами: открытие, закрытие, Escape, возврат фокуса. */
window.PortalModal = (function () {
    let lastFocus = null;
    let activeOverlay = null;
    const callbacks = new WeakMap();

    function getFocusable(container) {
        return Array.from(container.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null || el === document.activeElement);
    }

    function onKeydown(e) {
        if (e.key === 'Escape' && activeOverlay) {
            e.preventDefault();
            close(activeOverlay);
            return;
        }
        if (e.key !== 'Tab' || !activeOverlay) return;

        const dialog = activeOverlay.querySelector('[role="dialog"]');
        if (!dialog) return;

        const focusable = getFocusable(dialog);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function open(overlay) {
        if (!overlay) return;
        lastFocus = document.activeElement;
        activeOverlay = overlay;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        document.addEventListener('keydown', onKeydown);

        const dialog = overlay.querySelector('[role="dialog"]');
        const focusable = dialog ? getFocusable(dialog) : [];
        (focusable[0] || dialog)?.focus();
    }

    function close(overlay) {
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        if (activeOverlay === overlay) {
            activeOverlay = null;
            document.removeEventListener('keydown', onKeydown);
        }
        if (!activeOverlay) {
            document.body.classList.remove('modal-open');
        }
        const onClose = callbacks.get(overlay);
        if (onClose) onClose();
        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
        lastFocus = null;
    }

    function setup(overlay, options) {
        const { closeBtn, onClose, onCloseButtonClick } = options || {};
        overlay.setAttribute('aria-hidden', 'true');
        if (onClose) callbacks.set(overlay, onClose);

        overlay.querySelectorAll('.modal__close').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (typeof onCloseButtonClick === 'function') {
                    onCloseButtonClick();
                    return;
                }
                close(overlay);
            });
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', () => close(overlay));
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(overlay);
        });
    }

    return { open, close, setup };
})();
