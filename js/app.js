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
    const { trackerQueue, twoStepRequestTypes, usefulLinks, externalLinks } = config;

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
        const url = externalLinks?.[key];
        if (url) link.setAttribute('href', url);
    });

    const wikiUrl = String(externalLinks?.wiki || '').trim();
    const learningUrl = String(externalLinks?.learning || '').trim();
    if (wikiUrl && learningUrl && wikiUrl === learningUrl && portalLinks.learning) {
        portalLinks.learning.hidden = true;
        portalLinks.learning.setAttribute('aria-hidden', 'true');
    }

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
        showGlobalNotice('Портал работает в демо-режиме: заявки не отправляются в production Tracker.');
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
        if (!container || document.getElementById('step2Fields')) return;

        const step2 = document.createElement('div');
        step2.id = 'step2Fields';
        step2.innerHTML = `
            <div class="form-group">
                <h4>Сервисы и доступы</h4>
                <p class="step2-hint">Лучше всего уточнить у руководителя</p>
                <div class="step2-stack">
                    <label><input type="checkbox" name="accessService" value="Учетная запись ПК"> Учётная запись для ПК, или ТСД</label>
                    <label><input type="checkbox" name="accessService" value="Яндекс.Почта"> Яндекс.Почта</label>
                    <label><input type="checkbox" name="accessService" value="Call-Centre"> Call-Centre</label>
                    <label><input type="checkbox" name="accessService" value="Битрикс"> Битрикс</label>
                    <label><input type="checkbox" name="accessService" value="Сетевая каталоги/группы"> Сетевая каталоги/группы</label>
                    <label><input type="checkbox" name="accessService" value="Базы 1С"> Базы 1С</label>
                    <label><input type="checkbox" name="accessService" value="Банковские сервисы"> Доступ к банковским сервисам</label>
                    <label><input type="checkbox" name="accessService" value="Серверы"> Доступ к серверам</label>
                </div>
            </div>
            <div class="form-group">
                <label for="mailList">В какую почтовую рассылку добавить?</label>
                <input type="text" id="mailList" name="mailList" placeholder="">
            </div>
            <div class="form-group">
                <label for="bitrixGroup">В какую группу Битрикс добавить?</label>
                <input type="text" id="bitrixGroup" name="bitrixGroup" placeholder="Если не надо - оставляем пустым">
            </div>
            <div class="form-group">
                <h4>Какие сетевые папки и диски нужно предоставить?</h4>
                <div id="netFoldersWrap">
                    <div class="net-folder-item step2-box">
                        <div class="step2-disk-title">Буква диска</div>
                        <label><input type="radio" name="netDisk" value="T"> Диск T</label>
                        <label><input type="radio" name="netDisk" value="R"> Диск R</label>
                        <div class="step2-input-wrap"><input type="text" name="netPath" placeholder="Расположение, или наименование папки"></div>
                    </div>
                </div>
                <button type="button" id="addNetFolderBtn">+ Ещё</button>
            </div>
            <div class="form-group">
                <label>Какие базы 1С на устройстве?</label>
                <div class="step2-stack-small">
                    <label><input type="checkbox" name="base1c" value="Рабочая база (УТ)"> Рабочая база (УТ)</label>
                    <label><input type="checkbox" name="base1c" value="Тестовая база"> Тестовая база</label>
                    <label><input type="checkbox" name="base1c" value="УАТ / ТЛЭ"> УАТ / ТЛЭ</label>
                    <label><input type="checkbox" name="base1c" value="ЗУП"> ЗУП</label>
                    <label><input type="checkbox" name="base1c" value="БУХ"> БУХ</label>
                </div>
            </div>
            <div class="form-group">
                <h4>К каким банковским сервисам нужен доступ?</h4>
                <div class="step2-stack-small">
                    <label><input type="checkbox" name="bankService" value="Альфа-банк"> Альфа-банк</label>
                    <label><input type="checkbox" name="bankService" value="БНБ"> БНБ</label>
                    <label><input type="checkbox" name="bankService" value="БР"> БР</label>
                    <label><input type="checkbox" name="bankService" value="ВТБ"> ВТБ</label>
                    <label><input type="checkbox" name="bankService" value="Дабработ"> Дабработ</label>
                    <label><input type="checkbox" name="bankService" value="МТБ"> МТБ</label>
                    <label><input type="checkbox" name="bankService" value="Приор"> Приор</label>
                </div>
                <label for="serversAccess" class="step2-title-strong">К каким серверам нужен доступ?</label>
                <input type="text" id="serversAccess" name="serversAccess" placeholder="Например: vws-ots-fszn.triovist.local">
            </div>
            <div class="form-group">
                <h4>Оборудование</h4>
                <label><input type="checkbox" name="needIssue" value="Да"> Нужно ли выдавать оборудование?</label>
                <label><input type="checkbox" name="needReturn" value="Да"> Нужно ли сдавать оборудование?</label>
            </div>
            <div class="form-group">
                <h4>Детали оборудования</h4>
                <div class="step2-grid">
                    <div>
                        <label for="computerName">Имя компьютера:</label>
                        <input type="text" id="computerName" name="computerName" placeholder="">
                    </div>
                    <div>
                        <label for="receiveLocation">Где сотрудник будет получать оборудование?</label>
                        <select id="receiveLocation" name="receiveLocation">
                            <option value="">-</option>
                            <option>ПВЗ</option>
                            <option>Склад</option>
                            <option>Депо</option>
                            <option>Офис Покровский</option>
                        </select>
                        <div class="step2-note">Там же ему надо будет расписываться в накладной</div>
                    </div>
                    <div>
                        <label for="placeWrite">Напишите место</label>
                        <input type="text" id="placeWrite" name="placeWrite" placeholder="ПВЗ, склад, депо?">
                    </div>
                    <div>
                        <label class="step2-title-strong">Основное устройство</label>
                        <div class="step2-stack">
                            <label><input type="checkbox" name="mainDevice" value="ПК"> Персональный компьютер</label>
                            <label><input type="checkbox" name="mainDevice" value="Ноутбук"> Ноутбук</label>
                            <label><input type="checkbox" name="mainDevice" value="MacBook"> MacBook</label>
                            <label><input type="checkbox" name="mainDevice" value="Смартфон"> Смартфон</label>
                            <label><input type="checkbox" name="mainDevice" value="ТСД"> ТСД</label>
                        </div>
                    </div>
                    <div>
                        <label class="step2-title-strong">Доп. оборудование и периферия</label>
                        <div class="step2-stack">
                            <label><input type="checkbox" name="peripheral" value="Гарнитура"> Гарнитура</label>
                            <label><input type="checkbox" name="peripheral" value="Клавиатура/мышь"> Клавиатура/мышь</label>
                            <label><input type="checkbox" name="peripheral" value="Док-станция"> Док-станция</label>
                            <label><input type="checkbox" name="peripheral" value="Монитор1"> Монитор 1 шт.</label>
                            <label><input type="checkbox" name="peripheral" value="Монитор2"> Монитор 2 шт.</label>
                            <label><input type="checkbox" name="peripheral" value="Sim"> Sim-карта</label>
                        </div>
                    </div>
                    <div>
                        <label for="simTariff">Выберите тариф для Sim-карты</label>
                        <select id="simTariff" name="simTariff">
                            <option value="">-</option>
                            <option>Тариф A</option>
                            <option>Тариф B</option>
                        </select>
                    </div>
                    <div>
                        <label for="equipDesc">Дополнительное описание</label>
                        <textarea id="equipDesc" name="equipDesc" rows="4" placeholder=""></textarea>
                    </div>
                    <div>
                        <label for="returnLocation">Где сотрудник будет сдавать оборудование?</label>
                        <select id="returnLocation" name="returnLocation">
                            <option value="">-</option>
                            <option>ПВЗ</option>
                            <option>Склад</option>
                            <option>Депо</option>
                        </select>
                        <div class="step2-note">Там же ему надо будет расписываться в накладной</div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(step2);

        const first = step2.querySelector('.net-folder-item');
        if (first) {
            netFolderCounter++;
            first.querySelectorAll('input[type="radio"]').forEach(r => { r.name = `netDisk_${netFolderCounter}`; });
        }

        const addBtn = document.getElementById('addNetFolderBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const wrap = document.getElementById('netFoldersWrap');
                netFolderCounter++;
                const node = document.createElement('div');
                node.className = 'net-folder-item step2-box';
                node.innerHTML = `<div class="step2-disk-title">Буква диска</div>
                    <label><input type="radio" value="T"> Диск T</label>
                    <label><input type="radio" value="R"> Диск R</label>
                    <div class="step2-input-wrap"><input type="text" name="netPath" placeholder="Расположение, или наименование папки"></div>`;
                node.querySelectorAll('input[type="radio"]').forEach(r => { r.name = `netDisk_${netFolderCounter}`; });
                wrap.appendChild(node);
            });
        }
    }

    function buildTechSupportExtra() {
        const detailedVal = document.getElementById('detailedText')?.value.trim() || '';
        const loc = dynamicForm.querySelector('input[name="location"]:checked')?.value || '';
        return `\nДетали: ${detailedVal}\nМестоположение: ${loc}`;
    }

    function buildHrNewExtra() {
        const fioEmp = document.getElementById('fioEmployee')?.value.trim() || '';
        const posEmp = document.getElementById('positionEmployee')?.value.trim() || '';
        const deptEmp = document.getElementById('departmentEmployee')?.value.trim() || '';
        const mgrEmp = document.getElementById('managerEmployee')?.value.trim() || '';
        const startEmp = document.getElementById('startDateEmployee')?.value.trim() || '';
        const obsEmp = document.getElementById('observersEmployee')?.value.trim() || '';
        const accessServices = Array.from(document.querySelectorAll('input[name="accessService"]:checked')).map(i => i.value).join(', ');
        const mailList = document.getElementById('mailList')?.value.trim() || '';
        const bitrixGroup = document.getElementById('bitrixGroup')?.value.trim() || '';
        const netFolders = Array.from(document.querySelectorAll('.net-folder-item')).map(node => {
            const disk = node.querySelector('input[type="radio"]:checked')?.value || '';
            const path = node.querySelector('input[name="netPath"]')?.value.trim() || '';
            return disk || path ? `${disk}:${path}` : '';
        }).filter(Boolean).join('; ');
        const bases1c = Array.from(document.querySelectorAll('input[name="base1c"]:checked')).map(i => i.value).join(', ');
        const bankServices = Array.from(document.querySelectorAll('input[name="bankService"]:checked')).map(i => i.value).join(', ');
        const serversAccess = document.getElementById('serversAccess')?.value.trim() || '';
        const mainDevices = Array.from(document.querySelectorAll('input[name="mainDevice"]:checked')).map(i => i.value).join(', ');
        const peripherals = Array.from(document.querySelectorAll('input[name="peripheral"]:checked')).map(i => i.value).join(', ');
        const simTariff = document.getElementById('simTariff')?.value || '';
        const equipDesc = document.getElementById('equipDesc')?.value.trim() || '';
        const returnLocation = document.getElementById('returnLocation')?.value || '';
        const needIssue = document.querySelector('input[name="needIssue"]:checked') ? 'Да' : 'Нет';
        const needReturn = document.querySelector('input[name="needReturn"]:checked') ? 'Да' : 'Нет';
        const computerName = document.getElementById('computerName')?.value.trim() || '';
        const placeWrite = document.getElementById('placeWrite')?.value.trim() || '';

        return `\nФИО сотрудника: ${fioEmp}\nДолжность: ${posEmp}\nОтдел: ${deptEmp}\nРуководитель: ${mgrEmp}\nДата первого рабочего дня: ${startEmp}\nНаблюдатели: ${obsEmp}\n\nДоступы к сервисам: ${accessServices}\nПочтовая рассылка: ${mailList}\nГруппа Битрикс: ${bitrixGroup}\nСетевые папки: ${netFolders}\nБазы 1С: ${bases1c}\nБанковские сервисы: ${bankServices}\nДоступ к серверам: ${serversAccess}\n\nВыдавать оборудование: ${needIssue}\nСдавать оборудование: ${needReturn}\nИмя компьютера: ${computerName}\nМесто (уточнение): ${placeWrite}\nОсновные устройства: ${mainDevices}\nПериферия: ${peripherals}\nSIM тариф: ${simTariff}\nОписание оборудования: ${equipDesc}\nГде получить: ${document.getElementById('receiveLocation')?.value || ''}\nГде сдавать: ${returnLocation}`;
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
            const url = usefulLinks[useful];
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
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
