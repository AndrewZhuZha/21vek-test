document.addEventListener('DOMContentLoaded', () => {
    bootstrapApp();
});

async function bootstrapApp() {
    const config = window.PortalConfig || {};
    const auth = window.PortalAuth;

    if (auth?.isEnabled()) {
        await auth.whenReady();
        if (auth.isRequired() && !auth.isAuthenticated()) {
            return;
        }
    }

    initPortalApp(config);
}

function getAuthPrefillName() {
    const authConfig = window.PortalConfig?.auth || {};
    if (!authConfig.autoFillFio) return '';
    const user = window.PortalAuth?.getUser();
    return user?.displayName || '';
}

function initPortalApp(config) {
    const { trackerQueue, twoStepRequestTypes } = config;
    const externalLinks = { ...(config.externalLinks || {}) };
    const usefulLinks = { ...(config.usefulLinks || {}) };
    const runtimeLinks = {
        external: { ...externalLinks },
        useful: { ...usefulLinks }
    };

    function markDecorativeIcons() {
        document.querySelectorAll('.group-title > span:first-child, .card-icon, .scroll-to-top__icon')
            .forEach((node) => {
                node.setAttribute('aria-hidden', 'true');
            });
    }

    const portalLinks = {};
    document.querySelectorAll('[data-portal-link]').forEach(link => {
        const key = link.getAttribute('data-portal-link');
        if (key) {
            portalLinks[key] = link;
        }
    });

    const wikiLinkHelpers = window.PortalAppWikiLinks?.init({
        config,
        portalLinks,
        runtimeLinks
    }) || {};

    const applyPortalLinkHref = wikiLinkHelpers.applyPortalLinkHref || ((link, url) => {
        if (link && url) link.setAttribute('href', url);
    });
    const openPortalUrl = wikiLinkHelpers.openPortalUrl || ((rawUrl) => {
        const url = String(rawUrl || '').trim();
        if (url) window.location.href = url;
    });

    document.querySelectorAll('[data-portal-link]').forEach(link => {
        const key = link.getAttribute('data-portal-link');
        const url = runtimeLinks.external?.[key];
        if (url) applyPortalLinkHref(link, url);
    });

    markDecorativeIcons();

    const taglineEl = document.getElementById('portalTagline');
    if (taglineEl && config.portalTagline) {
        taglineEl.textContent = config.portalTagline;
    }

    document.querySelectorAll('[data-support-mail]').forEach(link => {
        const email = config.supportEmail || 'itsupport@21vek.by';
        const subject = link.getAttribute('data-mail-subject') || 'ИТ-портал — обращение';
        link.setAttribute('href', `mailto:${email}?subject=${encodeURIComponent(subject)}`);
    });
    const { open: openModal, close: closeModalOverlay, setup: setupModal } = window.PortalModal;
    const {
        showError,
        showNotice,
        clearError,
        requireValue,
        showGlobalError,
        showGlobalNotice,
        clearGlobalNotice
    } = window.PortalForm;

    clearGlobalNotice();
    if (config.demoMode) {
        const demoMessage = 'Демо-режим: заявки не создаются в Yandex Tracker. Номер DEMO-* — только имитация успеха.';
        if (window.PortalForm?.showGlobalDemoNotice) {
            window.PortalForm.showGlobalDemoNotice(demoMessage);
        } else {
            showGlobalNotice(demoMessage);
        }
    }

    const requestMap = window.PortalRequestTypes || {};
    if (!Object.keys(requestMap).length) {
        console.error('PortalRequestTypes не загружен. Запустите: node scripts/build-search-index.mjs');
    }

    const modalOverlay = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');
    const subcategorySelect = document.getElementById('subcategorySelect');
    const summaryInput = document.getElementById('summary');
    const dynamicForm = document.getElementById('dynamicForm');
    const submitBtn = document.getElementById('submitTaskBtn');
    const cancelBtn = document.getElementById('closeModalBtn');

    let currentRequestKey = '';
    let modalStep = 1;
    let netFolderCounter = 0;

    function isTwoStepRequest(key) {
        return twoStepRequestTypes.includes(key);
    }

    function goBackToStep1() {
        const step2 = document.getElementById('step2Fields');
        if (step2) step2.remove();
        modalStep = 1;
        netFolderCounter = 0;
        setModalButtonsForStep(1);
        clearError(dynamicForm);
    }

    function handleCancelClick() {
        if (modalStep === 2 && isTwoStepRequest(currentRequestKey)) {
            goBackToStep1();
            return;
        }
        closeTaskModal();
    }

    function setModalButtonsForStep(step) {
        if (!submitBtn || !cancelBtn) return;

        if (step === 1) {
            submitBtn.textContent = isTwoStepRequest(currentRequestKey)
                ? 'Далее'
                : 'Создать задачу в Трекере';
            cancelBtn.textContent = 'Отмена';
        } else if (step === 2) {
            submitBtn.textContent = 'Оставить заявку!';
            cancelBtn.textContent = 'Назад';
        }
    }

    function resetTaskModalState() {
        dynamicForm.reset();
        document.getElementById('conditionalFields').innerHTML = '';
        const step2 = document.getElementById('step2Fields');
        if (step2) step2.remove();
        modalStep = 1;
        netFolderCounter = 0;
        setModalButtonsForStep(1);
        clearError(dynamicForm);
        window.PortalTracker?.setButtonLoading(submitBtn, false);
        window.PortalTracker?.releaseTaskSubmitLock();
    }

    function closeTaskModal() {
        closeModalOverlay(modalOverlay);
    }

    function renderStep2() {
        if (currentRequestKey !== 'hr_new') return;
        const container = document.getElementById('conditionalFields');
        netFolderCounter = window.PortalAppHrWizard?.renderStep2(container, (counter) => {
            netFolderCounter = counter;
        }) ?? netFolderCounter;
    }

    function buildHrNewExtra() {
        return window.PortalAppHrWizard?.buildHrNewExtra() || '';
    }

    function buildTechSupportExtra() {
        const detailedVal = document.getElementById('detailedText')?.value.trim() || '';
        const loc = dynamicForm.querySelector('input[name="location"]:checked')?.value || '';
        return `\nДетали: ${detailedVal}\nМестоположение: ${loc}`;
    }

    function validateStep1() {
        const fioVal = document.getElementById('fio')?.value.trim();
        const summaryVal = summaryInput.value.trim();

        const err = requireValue(fioVal, 'Заполните ФИО')
            || requireValue(summaryVal, 'Заполните краткое описание');
        if (err) return err;

        if (currentRequestKey === 'tech_support' || currentRequestKey === 'software_issues') {
            const detailedEl = document.getElementById('detailedText');
            if (!detailedEl?.value.trim()) {
                return 'Заполните детальное описание (до 1000 символов)';
            }
            if (!dynamicForm.querySelector('input[name="location"]:checked')) {
                return 'Выберите местоположение';
            }
        }

        if (currentRequestKey === 'hr_new') {
            const checks = [
                requireValue(document.getElementById('fioEmployee')?.value, 'Введите ФИО сотрудника'),
                requireValue(document.getElementById('positionEmployee')?.value, 'Введите должность сотрудника'),
                requireValue(document.getElementById('departmentEmployee')?.value, 'Укажите отдел (подразделение)'),
                requireValue(document.getElementById('managerEmployee')?.value, 'Укажите непосредственного руководителя'),
                requireValue(document.getElementById('startDateEmployee')?.value, 'Укажите дату первого рабочего дня')
            ];
            const failed = checks.find(Boolean);
            if (failed) return failed;
        }

        return null;
    }

    async function submitTask() {
        const tracker = window.PortalTracker;
        if (tracker?.isTaskSubmitLocked()) return;

        const summaryVal = summaryInput.value.trim();
        const subcat = subcategorySelect.value;
        const fioVal = document.getElementById('fio')?.value.trim() || '';
        let extra = '';

        if (currentRequestKey === 'tech_support' || currentRequestKey === 'software_issues') {
            extra = buildTechSupportExtra();
        } else if (currentRequestKey === 'hr_new') {
            extra = buildHrNewExtra();
        }

        const taskPayload = {
            queue: trackerQueue,
            summary: summaryVal,
            description: `ФИО заявителя: ${fioVal}\nКатегория: ${requestMap[currentRequestKey]?.title}\nПодкатегория: ${subcat}\n---${extra}`,
            source: 'web-form',
            requestType: currentRequestKey
        };

        tracker?.setButtonLoading(submitBtn, true, 'Отправка…');
        tracker?.lockTaskSubmit();

        try {
            const result = await tracker.submitToTracker(taskPayload);

            if (result.demo) {
                showNotice(dynamicForm, 'Демо-режим backend: заявка принята и не отправлена в продовый Tracker. Окно закроется автоматически.');
                document.dispatchEvent(new CustomEvent('portal:task-submitted', {
                    detail: { demo: true, requestType: currentRequestKey }
                }));
                window.setTimeout(closeTaskModal, 2500);
                return;
            }

            const message = tracker.buildIssueSuccessMessage(result.data);
            showNotice(dynamicForm, message);
            document.dispatchEvent(new CustomEvent('portal:task-submitted', {
                detail: {
                    issueKey: result.data?.issueKey || result.data?.key,
                    requestType: currentRequestKey
                }
            }));
            window.setTimeout(closeTaskModal, 3000);
        } catch (error) {
            const message = error?.message || 'Не удалось отправить заявку. Попробуйте позже.';
            showError(dynamicForm, message);
            if (error?.needsLogin || error?.status === 401) {
                window.setTimeout(() => {
                    if (window.PortalAuth?.login) {
                        window.PortalAuth.login();
                    }
                }, 900);
            }
            document.dispatchEvent(new CustomEvent('portal:task-failed', {
                detail: { error: message, requestType: currentRequestKey }
            }));
            tracker?.releaseTaskSubmitLock();
        } finally {
            tracker?.setButtonLoading(submitBtn, false);
        }
    }

    function openTaskModal(requestKey) {
        const cfg = requestMap[requestKey];
        if (!cfg) return;

        currentRequestKey = requestKey;
        modalStep = 1;
        netFolderCounter = 0;
        clearError(dynamicForm);

        modalTitle.textContent = cfg.title;
        modalDesc.textContent = `Форма «${cfg.title}» — заполните детали, задача будет создана в Яндекс Трекере.`;

        subcategorySelect.innerHTML = '';
        cfg.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === cfg.defaultOpt) option.selected = true;
            subcategorySelect.appendChild(option);
        });

        summaryInput.value = '';
        const prefillFio = getAuthPrefillName();
        document.getElementById('fio').value = prefillFio;

        const conditional = document.getElementById('conditionalFields');
        conditional.innerHTML = '';

        if (requestKey === 'tech_support' || requestKey === 'software_issues') {
            const df = document.createElement('div');
            df.className = 'form-group';
            const lab = document.createElement('label');
            lab.htmlFor = 'detailedText';
            lab.textContent = 'Детальное описание (до 1000 символов) *';
            const ta = document.createElement('textarea');
            ta.id = 'detailedText';
            ta.name = 'detailedText';
            ta.maxLength = 1000;
            ta.required = true;
            ta.rows = 5;
            ta.placeholder = 'Опишите проблему подробно (до 1000 символов)';
            df.appendChild(lab);
            df.appendChild(ta);
            conditional.appendChild(df);

            const locWrap = document.createElement('div');
            locWrap.className = 'form-group';
            const locLabel = document.createElement('div');
            locLabel.className = 'location-group-title';
            locLabel.textContent = 'Местоположение *';
            locWrap.appendChild(locLabel);

            const locations = ['Офис Покровский', 'Таборы', 'ПВЗ', 'РЦ', 'Склад'];
            const box = document.createElement('div');
            box.className = 'location-options';
            locations.forEach((loc, idx) => {
                const id = `loc_${requestKey}_${idx}`;
                const el = document.createElement('label');
                el.className = 'location-option';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'location';
                input.value = loc;
                input.id = id;
                input.required = true;
                const span = document.createElement('span');
                span.textContent = loc;
                el.appendChild(input);
                el.appendChild(span);
                box.appendChild(el);
            });
            locWrap.appendChild(box);
            conditional.appendChild(locWrap);
        } else if (requestKey === 'hr_new') {
            const sections = [
                {
                    title: 'Общая информация о сотруднике',
                    fields: [
                        { id: 'fioEmployee', label: 'ФИО сотрудника *', type: 'text', placeholder: 'Полное фамилия, имя и отчество', required: true }
                    ]
                },
                {
                    title: 'Информация о месте работы',
                    fields: [
                        { id: 'positionEmployee', label: 'Должность сотрудника *', type: 'text', placeholder: 'Данные по ЗУП', required: true },
                        { id: 'departmentEmployee', label: 'Отдел (подразделение) сотрудника *', type: 'text', placeholder: 'Для поиска начните вводить', required: true },
                        { id: 'managerEmployee', label: 'Непосредственный руководитель сотрудника *', type: 'text', placeholder: 'Для поиска начните вводить', required: true },
                        { id: 'startDateEmployee', label: 'Дата первого рабочего дня сотрудника *', type: 'date', required: true, note: 'Дата выхода сотрудника к рабочему месту' }
                    ]
                },
                {
                    title: 'Заинтересованные люди',
                    fields: [
                        { id: 'observersEmployee', label: 'Добавьте наблюдателей в заявку', type: 'text', placeholder: 'Для поиска начните вводить', required: false }
                    ]
                }
            ];

            sections.forEach(sec => {
                const wrap = document.createElement('div');
                wrap.className = 'form-group';
                const h = document.createElement('h4');
                h.className = 'hr-section-title';
                h.textContent = sec.title;
                wrap.appendChild(h);

                sec.fields.forEach(field => {
                    const fg = document.createElement('div');
                    fg.className = 'form-group';
                    const lbl = document.createElement('label');
                    lbl.htmlFor = field.id;
                    lbl.textContent = field.label;
                    const inp = document.createElement('input');
                    inp.type = field.type;
                    inp.id = field.id;
                    inp.name = field.id;
                    if (field.placeholder) inp.placeholder = field.placeholder;
                    if (field.required) inp.required = true;
                    fg.appendChild(lbl);
                    fg.appendChild(inp);
                    if (field.note) {
                        const note = document.createElement('div');
                        note.className = 'field-note';
                        note.textContent = field.note;
                        fg.appendChild(note);
                    }
                    wrap.appendChild(fg);
                });
                conditional.appendChild(wrap);
            });
        }

        if (requestKey === 'vm_create') summaryInput.placeholder = 'Напр.: ВМ 4 vCPU, 16GB RAM, 100GB SSD';
        else if (requestKey === 'printer_setup') summaryInput.placeholder = 'Напр.: Настроить принтер в бухгалтерии';
        else summaryInput.placeholder = 'Кратко опишите суть';

        const prev = document.getElementById('step2Fields');
        if (prev) prev.remove();

        setModalButtonsForStep(1);
        openModal(modalOverlay);
        const fioInput = document.getElementById('fio');
        const prefersTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        if (fioInput && !prefersTouch) {
            fioInput.focus();
        }
    }

    document.querySelectorAll('.service-card').forEach(card => {
        if (!card.getAttribute('aria-label')) {
            const label = card.getAttribute('data-title')
                || card.querySelector('.card-title')?.textContent?.trim();
            if (label) card.setAttribute('aria-label', label);
        }
    });

    document.querySelectorAll('.service-card:not(.useful-card):not(.password-reset-card)').forEach(card => {
        card.addEventListener('click', () => {
            clearGlobalNotice();
            const reqType = card.getAttribute('data-request-type');
            if (reqType && requestMap[reqType]) {
                openTaskModal(reqType);
            } else {
                showGlobalError('Тип заявки временно не настроен. Обратитесь в IT Support.');
            }
        });
    });

    document.querySelectorAll('.useful-card').forEach(card => {
        card.addEventListener('click', () => {
            clearGlobalNotice();
            const useful = card.getAttribute('data-useful');
            const url = runtimeLinks.useful[useful];
            if (url) {
                openPortalUrl(url);
            }
        });
    });

    const reportBugBtn = document.getElementById('reportBugBtn');
    if (reportBugBtn) {
        reportBugBtn.addEventListener('click', () => {
            clearGlobalNotice();
            const bugRequestType = 'software_issues';
            if (!requestMap[bugRequestType]) {
                showGlobalError('Тип заявки "Сбои и ошибки ПО" временно не настроен. Обратитесь в IT Support.');
                return;
            }
            openTaskModal(bugRequestType);
            if (summaryInput && !summaryInput.value.trim()) {
                summaryInput.value = 'Сообщение о баге: ';
                if (typeof summaryInput.setSelectionRange === 'function') {
                    const pos = summaryInput.value.length;
                    summaryInput.setSelectionRange(pos, pos);
                }
            }
        });
    }

    setupModal(modalOverlay, { onClose: resetTaskModalState, onCloseButtonClick: handleCancelClick });
    cancelBtn.addEventListener('click', handleCancelClick);

    dynamicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError(dynamicForm);

        const step1Error = validateStep1();
        if (step1Error) {
            showError(dynamicForm, step1Error);
            return;
        }

        if (modalStep === 1 && isTwoStepRequest(currentRequestKey)) {
            renderStep2();
            modalStep = 2;
            setModalButtonsForStep(2);
            return;
        }

        await submitTask();
    });

    const resetBtn = document.getElementById('resetPasswordBtn');
    const pwModal = document.getElementById('pwResetModal');
    const pwForm = document.getElementById('pwResetForm');
    const pwSubmitBtn = document.getElementById('submitPwResetBtn');

    function resetPwModalState() {
        pwForm?.reset();
        clearError(pwForm);
        window.PortalTracker?.setButtonLoading(pwSubmitBtn, false);
        window.PortalTracker?.releaseResetSubmitLock();
    }

    function closePwModal() {
        closeModalOverlay(pwModal);
    }

    if (resetBtn && pwModal) {
        resetBtn.addEventListener('click', () => {
            clearError(pwForm);
            const requesterFio = document.getElementById('requesterFio');
            if (requesterFio && !requesterFio.value) {
                requesterFio.value = getAuthPrefillName();
            }
            openModal(pwModal);
        });
    }

    setupModal(pwModal, {
        closeBtn: document.getElementById('closePwModal'),
        onClose: resetPwModalState
    });

    if (pwForm) {
        pwForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearError(pwForm);

            const tracker = window.PortalTracker;
            if (tracker?.isResetSubmitLocked()) return;

            const target = document.getElementById('targetFio')?.value.trim();
            const requester = document.getElementById('requesterFio')?.value.trim();
            const reason = document.getElementById('resetReason')?.value.trim();

            const err = requireValue(target, 'Введите ФИО, кому сбросить пароль')
                || requireValue(requester, 'Введите ФИО, кто запрашивает')
                || requireValue(reason, 'Укажите причину сброса пароля');
            if (err) {
                showError(pwForm, err);
                return;
            }

            const payload = { target, requester, reason, source: 'web-reset' };

            tracker?.setButtonLoading(pwSubmitBtn, true, 'Отправка…');
            tracker?.lockResetSubmit();

            try {
                const result = await tracker.submitPasswordReset(payload);

                if (result.demo) {
                    showNotice(pwForm, 'Демо-режим backend: запрос принят и не отправлен в продовый Tracker. Окно закроется автоматически.');
                    window.setTimeout(closePwModal, 2500);
                    return;
                }

                showNotice(pwForm, 'Запрос на сброс пароля отправлен.');
                window.setTimeout(closePwModal, 2500);
            } catch (error) {
                const message = error?.message || 'Не удалось отправить запрос. Попробуйте позже.';
                showError(pwForm, message);
                if (error?.needsLogin || error?.status === 401) {
                    window.setTimeout(() => {
                        if (window.PortalAuth?.login) {
                            window.PortalAuth.login();
                        }
                    }, 900);
                }
                tracker?.releaseResetSubmitLock();
            } finally {
                tracker?.setButtonLoading(pwSubmitBtn, false);
            }
        });
    }
}
