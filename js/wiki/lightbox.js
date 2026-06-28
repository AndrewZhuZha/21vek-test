/** Lightbox для изображений Wiki: клик → просмотр, доп. zoom (+/−, колесо, pinch). */
(function () {
    const MIN_SCALE = 1;
    const MAX_SCALE = 3;
    const ZOOM_STEP = 0.25;
    const WHEEL_STEP = 0.12;

    let overlay = null;
    let stageEl = null;
    let imgEl = null;
    let captionEl = null;
    let zoomInBtn = null;
    let zoomOutBtn = null;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isOpen = false;
    let lastFocused = null;

    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOriginX = 0;
    let dragOriginY = 0;

    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let touchPanActive = false;

    function ensureDom() {
        if (overlay) {
            return;
        }

        overlay = document.createElement('div');
        overlay.className = 'wiki-lightbox hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="wiki-lightbox__toolbar">
                <button type="button" class="wiki-lightbox__btn wiki-lightbox__zoom-out" aria-label="Уменьшить">−</button>
                <button type="button" class="wiki-lightbox__btn wiki-lightbox__zoom-in" aria-label="Увеличить">+</button>
                <button type="button" class="wiki-lightbox__btn wiki-lightbox__btn--close" aria-label="Закрыть">×</button>
            </div>
            <div class="wiki-lightbox__stage">
                <img class="wiki-lightbox__img" alt="" decoding="async">
            </div>
            <p class="wiki-lightbox__caption hidden"></p>
            <p class="wiki-lightbox__hint">Колёсико, pinch или +/− для дополнительного увеличения. Перетаскивайте при zoom.</p>
        `;
        document.body.appendChild(overlay);

        stageEl = overlay.querySelector('.wiki-lightbox__stage');
        imgEl = overlay.querySelector('.wiki-lightbox__img');
        captionEl = overlay.querySelector('.wiki-lightbox__caption');
        zoomInBtn = overlay.querySelector('.wiki-lightbox__zoom-in');
        zoomOutBtn = overlay.querySelector('.wiki-lightbox__zoom-out');

        overlay.querySelector('.wiki-lightbox__btn--close')?.addEventListener('click', close);
        zoomInBtn?.addEventListener('click', () => zoomBy(ZOOM_STEP));
        zoomOutBtn?.addEventListener('click', () => zoomBy(-ZOOM_STEP));

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay || event.target === stageEl) {
                close();
            }
        });

        stageEl?.addEventListener('wheel', onWheel, { passive: false });
        stageEl?.addEventListener('pointerdown', onPointerDown);
        stageEl?.addEventListener('pointermove', onPointerMove);
        stageEl?.addEventListener('pointerup', onPointerUp);
        stageEl?.addEventListener('pointercancel', onPointerUp);
        stageEl?.addEventListener('pointerleave', onPointerUp);

        stageEl?.addEventListener('touchstart', onTouchStart, { passive: false });
        stageEl?.addEventListener('touchmove', onTouchMove, { passive: false });
        stageEl?.addEventListener('touchend', onTouchEnd);
        stageEl?.addEventListener('touchcancel', onTouchEnd);

        document.addEventListener('keydown', onKeyDown);
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function roundScale(value) {
        return Math.round(value * 100) / 100;
    }

    function applyTransform() {
        if (!imgEl) {
            return;
        }
        imgEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        if (zoomInBtn) {
            zoomInBtn.disabled = scale >= MAX_SCALE - 0.01;
        }
        if (zoomOutBtn) {
            zoomOutBtn.disabled = scale <= MIN_SCALE + 0.01;
        }
    }

    function resetView() {
        scale = MIN_SCALE;
        translateX = 0;
        translateY = 0;
        applyTransform();
    }

    function zoomBy(delta) {
        const next = roundScale(clamp(scale + delta, MIN_SCALE, MAX_SCALE));
        if (next === scale) {
            return;
        }
        scale = next;
        if (scale <= MIN_SCALE) {
            translateX = 0;
            translateY = 0;
        }
        applyTransform();
    }

    function onWheel(event) {
        if (!isOpen) {
            return;
        }
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
    }

    function onPointerDown(event) {
        if (!isOpen || scale <= MIN_SCALE) {
            return;
        }
        if (event.pointerType === 'touch') {
            return;
        }
        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragOriginX = translateX;
        dragOriginY = translateY;
        stageEl?.classList.add('is-dragging');
        stageEl?.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
        if (dragPointerId !== event.pointerId || scale <= MIN_SCALE) {
            return;
        }
        translateX = dragOriginX + (event.clientX - dragStartX);
        translateY = dragOriginY + (event.clientY - dragStartY);
        applyTransform();
    }

    function onPointerUp(event) {
        if (dragPointerId !== event.pointerId) {
            return;
        }
        dragPointerId = null;
        stageEl?.classList.remove('is-dragging');
    }

    function touchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    function onTouchStart(event) {
        if (!isOpen) {
            return;
        }
        if (event.touches.length === 2) {
            event.preventDefault();
            touchPanActive = false;
            pinchStartDistance = touchDistance(event.touches);
            pinchStartScale = scale;
            return;
        }
        if (event.touches.length === 1 && scale > MIN_SCALE) {
            touchPanActive = true;
            dragStartX = event.touches[0].clientX;
            dragStartY = event.touches[0].clientY;
            dragOriginX = translateX;
            dragOriginY = translateY;
            stageEl?.classList.add('is-dragging');
        }
    }

    function onTouchMove(event) {
        if (!isOpen) {
            return;
        }
        if (event.touches.length === 2 && pinchStartDistance) {
            event.preventDefault();
            const distance = touchDistance(event.touches);
            const ratio = distance / pinchStartDistance;
            scale = roundScale(clamp(pinchStartScale * ratio, MIN_SCALE, MAX_SCALE));
            if (scale <= MIN_SCALE) {
                translateX = 0;
                translateY = 0;
            }
            applyTransform();
            return;
        }
        if (touchPanActive && event.touches.length === 1 && scale > MIN_SCALE) {
            event.preventDefault();
            translateX = dragOriginX + (event.touches[0].clientX - dragStartX);
            translateY = dragOriginY + (event.touches[0].clientY - dragStartY);
            applyTransform();
        }
    }

    function onTouchEnd(event) {
        if (event.touches.length < 2) {
            pinchStartDistance = 0;
        }
        if (event.touches.length === 0) {
            touchPanActive = false;
            stageEl?.classList.remove('is-dragging');
        }
    }

    function onKeyDown(event) {
        if (!isOpen) {
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomBy(ZOOM_STEP);
            return;
        }
        if (event.key === '-') {
            event.preventDefault();
            zoomBy(-ZOOM_STEP);
        }
    }

    function open(src, alt) {
        const url = String(src || '').trim();
        if (!url) {
            return;
        }

        ensureDom();
        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        resetView();

        imgEl.src = url;
        imgEl.alt = String(alt || '').trim();

        const caption = String(alt || '').trim();
        if (captionEl) {
            captionEl.textContent = caption;
            captionEl.classList.toggle('hidden', !caption);
        }

        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        overlay.setAttribute('aria-label', caption || 'Просмотр изображения');
        document.body.classList.add('wiki-lightbox-open');
        isOpen = true;

        overlay.querySelector('.wiki-lightbox__btn--close')?.focus();
    }

    function close() {
        if (!overlay || !isOpen) {
            return;
        }
        isOpen = false;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('wiki-lightbox-open');
        if (imgEl) {
            imgEl.removeAttribute('src');
        }
        resetView();
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus();
        }
        lastFocused = null;
    }

    function bindImage(img) {
        if (!img || img.dataset.wikiLightboxBound === '1') {
            return;
        }
        const figure = img.closest('.wiki-figure');
        if (figure?.classList.contains('wiki-figure--error')) {
            return;
        }
        if (!img.src) {
            return;
        }

        img.dataset.wikiLightboxBound = '1';
        if (figure) {
            figure.classList.add('wiki-figure--zoomable');
        }

        const alt = String(img.getAttribute('alt') || '').trim();
        const label = alt ? `Увеличить: ${alt}` : 'Увеличить изображение';
        img.setAttribute('role', 'button');
        img.setAttribute('tabindex', '0');
        img.setAttribute('aria-label', label);

        const openFromImage = (event) => {
            if (!img.src || figure?.classList.contains('wiki-figure--loading')) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            open(img.currentSrc || img.src, img.alt);
        };

        img.addEventListener('click', openFromImage);
        img.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                openFromImage(event);
            }
        });

        if (figure && !figure.dataset.wikiLightboxHint) {
            figure.dataset.wikiLightboxHint = '1';
            figure.addEventListener('click', (event) => {
                if (event.target === img) {
                    return;
                }
                if (event.target.closest('.wiki-figure__loader')) {
                    return;
                }
                openFromImage(event);
            });
        }
    }

    function bindArticleImages(root) {
        const container = root || document.getElementById('wikiPageContent');
        if (!container) {
            return;
        }
        container.querySelectorAll('.wiki-figure__img, .wiki-article img').forEach((img) => {
            if (img.closest('.wiki-figure--error')) {
                return;
            }
            const bindWhenReady = () => bindImage(img);
            if (img.complete && img.naturalWidth > 0) {
                bindWhenReady();
            } else {
                img.addEventListener('load', bindWhenReady, { once: true });
                img.addEventListener('error', () => {}, { once: true });
            }
        });
    }

    window.PortalWikiLightbox = {
        open,
        close,
        bindArticleImages
    };
})();
