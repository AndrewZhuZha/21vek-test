/** Spotlight-overlay и popover для тура. */
window.PortalTourSpotlight = (function () {
    const PADDING = 8;
    const VIEWPORT_MARGIN = 12;
    const reduceMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };

    let root = null;
    let spotlight = null;
    let popover = null;
    let titleEl = null;
    let textEl = null;
    let progressEl = null;
    let backBtn = null;
    let nextBtn = null;
    let skipBtn = null;
    let activeTarget = null;
    let highlightedTarget = null;
    let rafScheduled = false;
    let onNext = null;
    let onBack = null;
    let onSkip = null;
    let lastFocus = null;

    function prefersReducedMotion() {
        return reduceMotionQuery.matches;
    }

    function getFocusable(container) {
        return Array.from(container.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null || el === document.activeElement);
    }

    function onKeydown(event) {
        if (!root) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            if (typeof onSkip === 'function') onSkip();
            return;
        }

        if (event.key !== 'Tab' || !popover) return;

        const focusable = getFocusable(popover);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function scheduleLayout() {
        if (rafScheduled || !root) return;
        rafScheduled = true;
        window.requestAnimationFrame(() => {
            rafScheduled = false;
            layoutCurrent();
        });
    }

    function clearHighlight() {
        if (highlightedTarget) {
            highlightedTarget.classList.remove('portal-tour-target');
            highlightedTarget = null;
        }
    }

    function layoutCurrent() {
        if (!spotlight || !popover) return;

        if (root && root.classList.contains('portal-tour--modal')) {
            positionModalPopover();
            return;
        }

        if (!activeTarget) return;

        const rect = activeTarget.getBoundingClientRect();
        if (!rect.width && !rect.height) {
            spotlight.style.display = 'none';
            return;
        }

        spotlight.style.display = 'block';
        const top = Math.max(VIEWPORT_MARGIN, rect.top - PADDING);
        const left = Math.max(VIEWPORT_MARGIN, rect.left - PADDING);
        const width = Math.min(window.innerWidth - VIEWPORT_MARGIN * 2, rect.width + PADDING * 2);
        const height = Math.min(window.innerHeight - VIEWPORT_MARGIN * 2, rect.height + PADDING * 2);

        spotlight.style.top = `${top}px`;
        spotlight.style.left = `${left}px`;
        spotlight.style.width = `${width}px`;
        spotlight.style.height = `${height}px`;

        positionPopover(rect, popover.dataset.placement || 'bottom');
    }

    function positionPopover(targetRect, placement) {
        const popRect = popover.getBoundingClientRect();
        const gap = 14;
        let top = targetRect.bottom + gap;
        let left = targetRect.left + (targetRect.width - popRect.width) / 2;

        if (placement === 'top' || placement === 'top-left') {
            top = targetRect.top - popRect.height - gap;
        }
        if (placement === 'top-left') {
            left = Math.max(VIEWPORT_MARGIN, targetRect.left);
        } else if (placement === 'left') {
            top = targetRect.top + (targetRect.height - popRect.height) / 2;
            left = targetRect.left - popRect.width - gap;
        } else if (placement === 'right') {
            top = targetRect.top + (targetRect.height - popRect.height) / 2;
            left = targetRect.right + gap;
        }

        left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - popRect.width - VIEWPORT_MARGIN));
        top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - popRect.height - VIEWPORT_MARGIN));

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        popover.style.transform = '';
    }

    function positionModalPopover() {
        popover.style.top = '50%';
        popover.style.left = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
    }

    function applyStepContent(step, index, total) {
        progressEl.hidden = Boolean(step.hideProgress);
        if (!step.hideProgress) {
            progressEl.textContent = `Шаг ${index + 1} из ${total}`;
        }

        titleEl.textContent = step.title;
        textEl.textContent = step.text;

        backBtn.hidden = step.hideBack !== undefined ? step.hideBack : index === 0;
        skipBtn.hidden = Boolean(step.hideSkip);
        nextBtn.textContent = step.nextLabel || (index === total - 1 ? 'Готово' : 'Далее');
    }

    function activateTourUi() {
        root.classList.add('portal-tour--active');
        root.setAttribute('aria-hidden', 'false');

        if (!lastFocus) {
            lastFocus = document.activeElement;
        }

        window.requestAnimationFrame(() => {
            layoutCurrent();
            nextBtn.focus();
        });

        document.addEventListener('keydown', onKeydown);
    }

    function showModalStep(step, index, total, handlers) {
        onNext = handlers.onNext;
        onBack = handlers.onBack;
        onSkip = handlers.onSkip;

        if (typeof step.prepare === 'function') {
            step.prepare();
        }

        clearHighlight();
        activeTarget = null;

        root.classList.add('portal-tour--modal');
        spotlight.style.display = 'none';
        popover.classList.add('portal-tour__popover--center');
        popover.dataset.placement = 'center';

        applyStepContent(step, index, total);
        activateTourUi();
        return true;
    }

    function ensureDom() {
        if (root) return;

        root = document.createElement('div');
        root.className = 'portal-tour';
        root.setAttribute('aria-hidden', 'true');

        spotlight = document.createElement('div');
        spotlight.className = 'portal-tour__spotlight';
        spotlight.setAttribute('aria-hidden', 'true');

        popover = document.createElement('div');
        popover.className = 'portal-tour__popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.setAttribute('aria-labelledby', 'portalTourTitle');
        popover.setAttribute('aria-describedby', 'portalTourText');
        popover.tabIndex = -1;

        progressEl = document.createElement('p');
        progressEl.className = 'portal-tour__progress';

        titleEl = document.createElement('h2');
        titleEl.className = 'portal-tour__title';
        titleEl.id = 'portalTourTitle';

        textEl = document.createElement('p');
        textEl.className = 'portal-tour__text';
        textEl.id = 'portalTourText';

        const actions = document.createElement('div');
        actions.className = 'portal-tour__actions';

        skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'portal-tour__skip btn-secondary';
        skipBtn.textContent = 'Пропустить';

        backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'portal-tour__back btn-secondary';
        backBtn.textContent = 'Назад';

        nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'portal-tour__next btn-primary';
        nextBtn.textContent = 'Далее';

        actions.appendChild(skipBtn);
        actions.appendChild(backBtn);
        actions.appendChild(nextBtn);

        popover.appendChild(progressEl);
        popover.appendChild(titleEl);
        popover.appendChild(textEl);
        popover.appendChild(actions);

        root.appendChild(spotlight);
        root.appendChild(popover);
        document.body.appendChild(root);

        skipBtn.addEventListener('click', () => {
            if (typeof onSkip === 'function') onSkip();
        });
        backBtn.addEventListener('click', () => {
            if (typeof onBack === 'function') onBack();
        });
        nextBtn.addEventListener('click', () => {
            if (typeof onNext === 'function') onNext();
        });

        window.addEventListener('resize', scheduleLayout);
        window.addEventListener('scroll', scheduleLayout, true);
    }

    function isFixedTarget(element) {
        return window.getComputedStyle(element).position === 'fixed';
    }

    function showStep(step, index, total, handlers) {
        ensureDom();
        onNext = handlers.onNext;
        onBack = handlers.onBack;
        onSkip = handlers.onSkip;

        if (step.modal) {
            return showModalStep(step, index, total, handlers);
        }

        if (typeof step.prepare === 'function') {
            step.prepare();
        }

        const target = document.querySelector(step.selector);
        if (!target) {
            return false;
        }

        const targetRect = target.getBoundingClientRect();
        if (!targetRect.width && !targetRect.height) {
            return false;
        }

        clearHighlight();
        activeTarget = target;
        highlightedTarget = target;
        target.classList.add('portal-tour-target');

        root.classList.remove('portal-tour--modal');
        popover.classList.remove('portal-tour__popover--center');
        spotlight.style.display = 'block';
        popover.dataset.placement = step.placement || 'bottom';

        const shouldScrollIntoView = !step.skipScrollIntoView && !isFixedTarget(target);
        if (shouldScrollIntoView) {
            if (!prefersReducedMotion()) {
                target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            }
        }

        applyStepContent(step, index, total);
        activateTourUi();
        layoutCurrent();
        return true;
    }

    function destroy() {
        document.removeEventListener('keydown', onKeydown);
        clearHighlight();
        activeTarget = null;

        if (root) {
            root.classList.remove('portal-tour--active', 'portal-tour--modal');
            root.setAttribute('aria-hidden', 'true');
        }
        if (popover) {
            popover.classList.remove('portal-tour__popover--center');
        }

        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
        lastFocus = null;
    }

    function teardown() {
        destroy();
        if (root && root.parentNode) {
            root.parentNode.removeChild(root);
        }
        root = null;
        spotlight = null;
        popover = null;
        window.removeEventListener('resize', scheduleLayout);
        window.removeEventListener('scroll', scheduleLayout, true);
    }

    function isModalOpen() {
        return Boolean(document.querySelector('.modal-overlay.active'));
    }

    return {
        showStep,
        destroy,
        teardown,
        isModalOpen,
        scheduleLayout
    };
})();
