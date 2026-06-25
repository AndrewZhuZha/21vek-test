
    // ----- маппинг для форм (задач) -----
    const requestMap = {
        tech_support: { title: "Техническая поддержка — запрос", options: ["Консультация", "Помощь с ПО", "Настройка рабочего места"], defaultOpt: "Консультация" },
        software_issues: { title: "Сбои и ошибки ПО", options: ["Критический сбой", "Зависание программы", "Ошибка при запуске"], defaultOpt: "Критический сбой" },
        equipment_issue: { title: "Выдача оборудования", options: ["Выдать ноутбук", "Выдать ПК", "Выдать монитор/периферию"], defaultOpt: "Выдать ноутбук" },
        equipment_return: { title: "Возврат оборудования", options: ["Сдача при увольнении", "Сдача в ремонт", "Списание"], defaultOpt: "Сдача при увольнении" },
        equipment_transfer: { title: "Передача оборудования", options: ["Передача другому сотруднику", "Перемещение между офисами"], defaultOpt: "Передача другому сотруднику" },
        hr_new: { title: "Новый сотрудник", options: ["Создать УЗ", "Выдать оборудование", "Оформить пропуск"], defaultOpt: "Создать УЗ" },
        hr_dismiss: { title: "Увольнение сотрудника", options: ["Блокировка УЗ", "Приём техники", "Отзыв доступов"], defaultOpt: "Блокировка УЗ" },
        hr_change: { title: "Изменение сотрудника", options: ["Смена отдела", "Изменение прав доступа", "Обновление данных"], defaultOpt: "Смена отдела" },
        org_structure: { title: "Изменение орг. структуры", options: ["Создать отдел", "Переименовать", "Удалить подразделение"], defaultOpt: "Создать отдел" },
        vm_create: { title: "Создание ВМ", options: ["Linux ВМ", "Windows ВМ", "Дополнительные ресурсы"], defaultOpt: "Linux ВМ" },
        network_access: { title: "Предоставление сетевого доступа", options: ["VPN доступ", "Открыть порт", "Доступ к VLAN"], defaultOpt: "VPN доступ" },
        skud_access: { title: "Предоставление доступа (СКУД)", options: ["Новый пропуск", "Настройка турникета", "Электронный замок"], defaultOpt: "Новый пропуск" },
        skud_repair: { title: "Ремонт СКУД", options: ["Не работает турникет", "Считыватель", "Контроллер"], defaultOpt: "Не работает турникет" },
        camera_install: { title: "Установка видеонаблюдения", options: ["Монтаж камеры", "Настройка записи", "Расширение системы"], defaultOpt: "Монтаж камеры" },
        printer_setup: { title: "Программная настройка принтера", options: ["Добавить принтер", "Настройка драйверов", "Сетевая печать"], defaultOpt: "Добавить принтер" },
        printer_repair: { title: "Ремонт и обслуживание принтера", options: ["Заправка картриджа", "Замена узлов", "Чистка/ремонт"], defaultOpt: "Заправка картриджа" },
        other_noform: { title: "Без формы — другой запрос", options: ["Произвольный запрос", "Административное", "Другое"], defaultOpt: "Произвольный запрос" },
        universal_it: { title: "Обращение в ИТ (универсальное)", options: ["Инцидент", "Запрос услуги", "Консультация"], defaultOpt: "Запрос услуги" }
    };

    const modalOverlay = document.getElementById('taskModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');
    const subcategorySelect = document.getElementById('subcategorySelect');
    const summaryInput = document.getElementById('summary');
    const dynamicForm = document.getElementById('dynamicForm');

    let currentRequestKey = '';
    let modalStep = 1; // 1 = initial, 2 = detailed

    const submitBtn = document.querySelector('#taskModal .btn-primary');
    const cancelBtn = document.getElementById('closeModalBtn');
    let netFolderCounter = 0;

    function setModalButtonsForStep(step) {
        if (!submitBtn || !cancelBtn) return;
        if (step === 1) {
            submitBtn.textContent = 'Далее';
            cancelBtn.textContent = 'Отмена';
            // cancel -> close modal
            cancelBtn.onclick = closeModal;
        } else if (step === 2) {
            submitBtn.textContent = 'Оставить заявку!';
            cancelBtn.textContent = 'Назад';
            // cancel -> go back to step1
            cancelBtn.onclick = () => {
                const step2 = document.getElementById('step2Fields');
                if (step2) step2.remove();
                modalStep = 1;
                setModalButtonsForStep(1);
            };
        }
    }

    function renderStep2(requestKey) {
        const container = document.getElementById('conditionalFields');
        if (!container) return;
        const step2 = document.createElement('div');
        step2.id = 'step2Fields';
        step2.style.marginTop = '0.6rem';
        step2.innerHTML = `
            <div class="form-group">
                <h4>Сервисы и доступы</h4>
                <p style="color:#5d7f97; margin-top:0.25rem;">Лучше всего уточнить у руководителя</p>
                <div style="display:flex;flex-direction:column;gap:0.45rem;margin-top:0.6rem;">
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
                <label>В какую почтовую рассылку добавить?</label>
                <input type="text" id="mailList" placeholder="">
            </div>
            <div class="form-group">
                <label>В какую группу Битрикс добавить?</label>
                <input type="text" id="bitrixGroup" placeholder="Если не надо - оставляем пустым">
            </div>
            <div class="form-group">
                <h4>Какие сетевые папки и диски нужно предоставить?</h4>
                <div id="netFoldersWrap">
                    <div class="net-folder-item" style="border:1px solid rgba(200,200,200,0.06); padding:0.8rem; border-radius:0.6rem; margin-bottom:0.6rem;">
                        <div style="margin-bottom:0.5rem; font-weight:600;">Буква диска</div>
                        <label><input type="radio" name="netDisk" value="T"> Диск T</label>
                        <label><input type="radio" name="netDisk" value="R"> Диск R</label>
                        <div style="margin-top:0.6rem;"><input type="text" name="netPath" placeholder="Расположение, или наименование папки" style="width:100%;"></div>
                    </div>
                </div>
                <button type="button" id="addNetFolderBtn" style="margin-top:0.4rem;">+ Ещё</button>
            </div>
            <div class="form-group">
                <label>Какие базы вы 1С на устройстве ?</label>
                <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.5rem;">
                    <label><input type="checkbox" name="base1c" value="Рабочая база (УТ)"> Рабочая база (УТ)</label>
                    <label><input type="checkbox" name="base1c" value="Тестовая база"> Тестовая база</label>
                    <label><input type="checkbox" name="base1c" value="УАТ / ТЛЭ"> УАТ / ТЛЭ</label>
                    <label><input type="checkbox" name="base1c" value="ЗУП"> ЗУП</label>
                    <label><input type="checkbox" name="base1c" value="БУХ"> БУХ</label>
                </div>
            </div>
            <div class="form-group">
                <h4>К каким банковским сервисам нужен доступ?</h4>
                <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.5rem;">
                    <label><input type="checkbox" name="bankService" value="Альфа-банк"> Альфа-банк</label>
                    <label><input type="checkbox" name="bankService" value="БНБ"> БНБ</label>
                    <label><input type="checkbox" name="bankService" value="БР"> БР</label>
                    <label><input type="checkbox" name="bankService" value="ВТБ"> ВТБ</label>
                    <label><input type="checkbox" name="bankService" value="Дабработ"> Дабработ</label>
                    <label><input type="checkbox" name="bankService" value="МТБ"> МТБ</label>
                    <label><input type="checkbox" name="bankService" value="Приор"> Приор</label>
                </div>
                <label style="margin-top:0.6rem;">К каким серверам нужен доступ?</label>
                <input type="text" id="serversAccess" placeholder="Например: vws-ots-fszn.triovist.local" style="width:100%;">
            </div>
            <div class="form-group">
                <h4>Оборудование</h4>
                <label><input type="checkbox" name="needIssue" value="Да"> Нужно ли выдавать оборудование?</label>
                <label><input type="checkbox" name="needReturn" value="Да"> Нужно ли сдавать оборудование?</label>
            </div>
            <div class="form-group">
                <h4>Оборудование</h4>
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.45rem;">
                    <div>
                        <label>Имя компьютера:</label>
                        <input type="text" id="computerName" placeholder="">
                    </div>
                    <div>
                        <label>Где сотрудник будет получать оборудование?</label>
                        <select id="receiveLocation">
                            <option value="">-</option>
                            <option>ПВЗ</option>
                            <option>Склад</option>
                            <option>Депо</option>
                            <option>Офис Покровский</option>
                        </select>
                        <div style="font-size:0.85rem;color:#5d7f97;margin-top:0.25rem;">Там же ему надо будет расписываться в накладной</div>
                    </div>
                    <div>
                        <label>Напишите место</label>
                        <input type="text" id="placeWrite" placeholder="ПВЗ, склад, депо?">
                    </div>
                    <div>
                        <label style="font-weight:700;margin-top:0.45rem;">Основное устройство</label>
                        <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">
                            <label><input type="checkbox" name="mainDevice" value="ПК"> Персональный компьютер</label>
                            <label><input type="checkbox" name="mainDevice" value="Ноутбук"> Ноутбук</label>
                            <label><input type="checkbox" name="mainDevice" value="MacBook"> MacBook</label>
                            <label><input type="checkbox" name="mainDevice" value="Смартфон"> Смартфон</label>
                            <label><input type="checkbox" name="mainDevice" value="ТСД"> ТСД</label>
                        </div>
                    </div>
                    <div>
                        <label style="font-weight:700;margin-top:0.45rem;">Доп. оборудование и периферия</label>
                        <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">
                            <label><input type="checkbox" name="peripheral" value="Гарнитура"> Гарнитура</label>
                            <label><input type="checkbox" name="peripheral" value="Клавиатура/мышь"> Клавиатура/мышь</label>
                            <label><input type="checkbox" name="peripheral" value="Док-станция"> Док-станция</label>
                            <label><input type="checkbox" name="peripheral" value="Монитор1"> Монитор 1 шт.</label>
                            <label><input type="checkbox" name="peripheral" value="Монитор2"> Монитор 2 шт.</label>
                            <label><input type="checkbox" name="peripheral" value="Sim"> Sim-карта</label>
                        </div>
                    </div>
                    <div>
                        <label>Выберите тариф для Sim-карты</label>
                        <select id="simTariff">
                            <option value="">-</option>
                            <option>Тариф A</option>
                            <option>Тариф B</option>
                        </select>
                    </div>
                    <div>
                        <label>Дополнительное описание</label>
                        <textarea id="equipDesc" rows="4" placeholder=""></textarea>
                    </div>
                    <div>
                        <label>Где сотрудник будет сдавать оборудование?</label>
                        <select id="returnLocation">
                            <option value="">-</option>
                            <option>ПВЗ</option>
                            <option>Склад</option>
                            <option>Депо</option>
                        </select>
                        <div style="font-size:0.85rem;color:#5d7f97;margin-top:0.25rem;">Там же ему надо будет расписываться в накладной</div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(step2);

        // set unique names for the initial net folder radio group
        const first = step2.querySelector('.net-folder-item');
        if (first) {
            netFolderCounter++;
            first.querySelectorAll('input[type="radio"]').forEach(r => r.name = `netDisk_${netFolderCounter}`);
            first.querySelectorAll('input[name="netPath"]').forEach(p => p.name = 'netPath');
        }

        // attach addNetFolder handler
        const addBtn = document.getElementById('addNetFolderBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const wrap = document.getElementById('netFoldersWrap');
                netFolderCounter++;
                const node = document.createElement('div');
                node.className = 'net-folder-item';
                node.style = 'border:1px solid rgba(200,200,200,0.06); padding:0.8rem; border-radius:0.6rem; margin-bottom:0.6rem;';
                node.innerHTML = `<div style="margin-bottom:0.5rem; font-weight:600;">Буква диска</div>
                    <label><input type="radio" value="T"> Диск T</label>
                    <label><input type="radio" value="R"> Диск R</label>
                    <div style="margin-top:0.6rem;"><input type="text" name="netPath" placeholder="Расположение, или наименование папки" style="width:100%;"></div>`;
                // set radios' name to unique group
                node.querySelectorAll('input[type="radio"]').forEach(r => r.name = `netDisk_${netFolderCounter}`);
                wrap.appendChild(node);
            });
        }
    }

    function openTaskModal(requestKey, displayTitle) {
        const cfg = requestMap[requestKey];
        if (!cfg) return;
        currentRequestKey = requestKey;
        modalTitle.innerText = cfg.title;
        modalDesc.innerText = `Форма «${cfg.title}» — заполните детали, задача будет создана в Яндекс Трекере.`;
        // Заполняем select
        subcategorySelect.innerHTML = '';
        cfg.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            if (opt === cfg.defaultOpt) option.selected = true;
            subcategorySelect.appendChild(option);
        });
        summaryInput.value = '';
        // description field removed — nothing to reset here
        // conditional fields container (injected for specific request types)
        const conditional = document.getElementById('conditionalFields');
        conditional.innerHTML = '';
        if (requestKey === 'tech_support' || requestKey === 'software_issues') {
            // 1) required text field up to 1000 chars
            const df = document.createElement('div');
            df.className = 'form-group';
            const lab = document.createElement('label');
            lab.textContent = 'Детальное описание (до 1000 символов) *';
            const ta = document.createElement('textarea');
            ta.id = 'detailedText';
            ta.maxLength = 1000;
            ta.required = true;
            ta.rows = 5;
            ta.placeholder = 'Опишите проблему подробно (до 1000 символов)';
            df.appendChild(lab);
            df.appendChild(ta);
            conditional.appendChild(df);

            // 2) location selection (single choice)
            const locWrap = document.createElement('div');
            locWrap.className = 'form-group';
            const locLabel = document.createElement('label');
            locLabel.textContent = 'Местоположение *';
            locWrap.appendChild(locLabel);

            const locations = ['Офис Покровский','Таборы','ПВЗ','РЦ','Склад'];
            const box = document.createElement('div');
            box.style.display = 'flex';
            box.style.flexDirection = 'column';
            box.style.gap = '0.35rem';
            locations.forEach((loc, idx) => {
                const id = `loc_${requestKey}_${idx}`;
                const el = document.createElement('label');
                el.style.display = 'inline-flex';
                el.style.alignItems = 'center';
                el.style.gap = '0.5rem';
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
        }
        // Detailed form for "Новый сотрудник"
        else if (requestKey === 'hr_new') {
            // Section: Общая информация о сотруднике
            const sec1 = document.createElement('div');
            sec1.className = 'form-group';
            const h1 = document.createElement('h4');
            h1.textContent = 'Общая информация о сотруднике';
            h1.style.margin = '0 0 0.5rem 0';
            h1.style.fontSize = '1.05rem';
            h1.style.fontWeight = '700';
            sec1.appendChild(h1);

            const f1 = document.createElement('div');
            f1.className = 'form-group';
            const lFio = document.createElement('label');
            lFio.textContent = 'ФИО сотрудника *';
            const inpFio = document.createElement('input');
            inpFio.type = 'text';
            inpFio.id = 'fioEmployee';
            inpFio.required = true;
            inpFio.placeholder = 'Полное фамилия, имя и отчество';
            f1.appendChild(lFio);
            f1.appendChild(inpFio);
            sec1.appendChild(f1);
            conditional.appendChild(sec1);

            // Section: Информация о месте работы
            const sec2 = document.createElement('div');
            sec2.className = 'form-group';
            const h2 = document.createElement('h4');
            h2.textContent = 'Информация о месте работы';
            h2.style.margin = '0.6rem 0 0.5rem 0';
            h2.style.fontSize = '1.05rem';
            h2.style.fontWeight = '700';
            sec2.appendChild(h2);

            const pos = document.createElement('div');
            pos.className = 'form-group';
            const lPos = document.createElement('label');
            lPos.textContent = 'Должность сотрудника *';
            const inpPos = document.createElement('input');
            inpPos.type = 'text';
            inpPos.id = 'positionEmployee';
            inpPos.required = true;
            inpPos.placeholder = 'Данные по ЗУП';
            pos.appendChild(lPos);
            pos.appendChild(inpPos);
            sec2.appendChild(pos);

            const dept = document.createElement('div');
            dept.className = 'form-group';
            const lDept = document.createElement('label');
            lDept.textContent = 'Отдел (подразделение) сотрудника *';
            const inpDept = document.createElement('input');
            inpDept.type = 'text';
            inpDept.id = 'departmentEmployee';
            inpDept.required = true;
            inpDept.placeholder = 'Для поиска начните вводить';
            dept.appendChild(lDept);
            dept.appendChild(inpDept);
            sec2.appendChild(dept);

            const mgr = document.createElement('div');
            mgr.className = 'form-group';
            const lMgr = document.createElement('label');
            lMgr.textContent = 'Непосредственный руководитель сотрудника *';
            const inpMgr = document.createElement('input');
            inpMgr.type = 'text';
            inpMgr.id = 'managerEmployee';
            inpMgr.required = true;
            inpMgr.placeholder = 'Для поиска начните вводить';
            mgr.appendChild(lMgr);
            mgr.appendChild(inpMgr);
            sec2.appendChild(mgr);

            const start = document.createElement('div');
            start.className = 'form-group';
            const lStart = document.createElement('label');
            lStart.textContent = 'Дата первого рабочего дня сотрудника *';
            const inpStart = document.createElement('input');
            inpStart.type = 'date';
            inpStart.id = 'startDateEmployee';
            inpStart.required = true;
            start.appendChild(lStart);
            start.appendChild(inpStart);
            const note = document.createElement('div');
            note.style.fontSize = '0.85rem';
            note.style.color = '#5d7f97';
            note.style.marginTop = '0.4rem';
            note.textContent = 'Дата выхода сотрудника к рабочему месту';
            start.appendChild(note);
            sec2.appendChild(start);

            conditional.appendChild(sec2);

            // Section: Заинтересованные люди
            const sec3 = document.createElement('div');
            sec3.className = 'form-group';
            const h3 = document.createElement('h4');
            h3.textContent = 'Заинтересованные люди';
            h3.style.margin = '0.6rem 0 0.5rem 0';
            h3.style.fontSize = '1.05rem';
            h3.style.fontWeight = '700';
            sec3.appendChild(h3);

            const obsLabel = document.createElement('label');
            obsLabel.textContent = 'Добавьте наблюдателей в заявку';
            const obsInput = document.createElement('input');
            obsInput.type = 'text';
            obsInput.id = 'observersEmployee';
            obsInput.placeholder = 'Для поиска начните вводить';
            sec3.appendChild(obsLabel);
            sec3.appendChild(obsInput);
            conditional.appendChild(sec3);
        }
        // placeholder для summary
        if (requestKey === 'vm_create') summaryInput.placeholder = 'Напр.: ВМ 4 vCPU, 16GB RAM, 100GB SSD';
        else if (requestKey === 'printer_setup') summaryInput.placeholder = 'Напр.: Настроить принтер в бухгалтерии';
        else summaryInput.placeholder = 'Кратко опишите суть';
        modalOverlay.classList.add('active');
        // reset to step 1
        modalStep = 1;
        // remove any previous step2 content
        const prev = document.getElementById('step2Fields'); if (prev) prev.remove();
        setModalButtonsForStep(1);
    }

    // Обработка кликов по карточкам заявок
    document.querySelectorAll('.service-card:not(.useful-card)').forEach(card => {
        card.addEventListener('click', (e) => {
            const reqType = card.getAttribute('data-request-type');
            const titleAttr = card.getAttribute('data-title') || '';
            if (reqType && requestMap[reqType]) {
                openTaskModal(reqType, titleAttr);
            } else {
                alert('Тип заявки временно не настроен, обратитесь в support.');
            }
        });
    });

    // Полезные ссылки – обработчики
    document.querySelectorAll('.useful-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const useful = card.getAttribute('data-useful');
            if (useful === 'cmdb') {
                alert('🔧 Переход в CMDB: узнать оборудование, закреплённое за сотрудником (демо-ссылка).\nРеальный URL: https://cmdb.company.ru');
                // window.open('https://cmdb.company.ru', '_blank');
            } else if (useful === 'phonebook') {
                alert('📞 Справочник телефонов компании (демо).\nРеальный URL: https://phonebook.company.ru');
            } else if (useful === 'knowledge') {
                alert('📚 База знаний ИТ: инструкции, гайды, FAQ.\nРеальный URL: https://wiki.company.ru');
            }
        });
    });

    function closeModal() { modalOverlay.classList.remove('active'); }
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });

    dynamicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const summaryVal = summaryInput.value.trim();
        if (!summaryVal) { alert('Заполните краткое описание'); return; }

        // STEP 1 -> validate and show step2
        if (modalStep === 1) {
            // If current request requires detailedText and location, validate them
            if (currentRequestKey === 'tech_support' || currentRequestKey === 'software_issues') {
                const detailedEl = document.getElementById('detailedText');
                if (!detailedEl || !detailedEl.value.trim()) { alert('Заполните детальное описание (до 1000 символов)'); return; }
                const loc = dynamicForm.querySelector('input[name="location"]:checked');
                if (!loc) { alert('Выберите местоположение'); return; }
            }
            // Validate fields for 'Новый сотрудник'
            if (currentRequestKey === 'hr_new') {
                const fioEmp = document.getElementById('fioEmployee')?.value.trim();
                const posEmp = document.getElementById('positionEmployee')?.value.trim();
                const deptEmp = document.getElementById('departmentEmployee')?.value.trim();
                const mgrEmp = document.getElementById('managerEmployee')?.value.trim();
                const startEmp = document.getElementById('startDateEmployee')?.value.trim();
                if (!fioEmp) { alert('Введите ФИО сотрудника'); return; }
                if (!posEmp) { alert('Введите должность сотрудника'); return; }
                if (!deptEmp) { alert('Укажите отдел (подразделение)'); return; }
                if (!mgrEmp) { alert('Укажите непосредственного руководителя'); return; }
                if (!startEmp) { alert('Укажите дату первого рабочего дня'); return; }
            }

            // render step2
            renderStep2(currentRequestKey);
            modalStep = 2;
            setModalButtonsForStep(2);
            return;
        }

        // STEP 2 -> final validation & assemble payload
        const subcat = subcategorySelect.value;
        const descDetail = '—';
        let extra = '';
        // preserve earlier extras
        if (currentRequestKey === 'tech_support' || currentRequestKey === 'software_issues') {
            const detailedVal = document.getElementById('detailedText')?.value.trim() || '';
            const loc = dynamicForm.querySelector('input[name="location"]:checked')?.value || '';
            extra = `\nДетали: ${detailedVal}\nМестоположение: ${loc}`;
        } else if (currentRequestKey === 'hr_new') {
            const fioEmp = document.getElementById('fioEmployee')?.value.trim() || '';
            const posEmp = document.getElementById('positionEmployee')?.value.trim() || '';
            const deptEmp = document.getElementById('departmentEmployee')?.value.trim() || '';
            const mgrEmp = document.getElementById('managerEmployee')?.value.trim() || '';
            const startEmp = document.getElementById('startDateEmployee')?.value.trim() || '';
            const obsEmp = document.getElementById('observersEmployee')?.value.trim() || '';
            // collect step2 additional fields
            const accessServices = Array.from(document.querySelectorAll('input[name="accessService"]:checked')).map(i=>i.value).join(', ');
            const mailList = document.getElementById('mailList')?.value.trim() || '';
            const bitrixGroup = document.getElementById('bitrixGroup')?.value.trim() || '';
            const netFolders = Array.from(document.querySelectorAll('.net-folder-item')).map(node=>{
                const disk = node.querySelector('input[type="radio"]:checked')?.value || '';
                const path = node.querySelector('input[name="netPath"]')?.value.trim() || '';
                return `${disk}:${path}`;
            }).filter(Boolean).join('; ');
            const bases1c = Array.from(document.querySelectorAll('input[name="base1c"]:checked')).map(i=>i.value).join(', ');
            const bankServices = Array.from(document.querySelectorAll('input[name="bankService"]:checked')).map(i=>i.value).join(', ');
            const serversAccess = document.getElementById('serversAccess')?.value.trim() || '';
            const needIssue = Array.from(document.querySelectorAll('input[name="mainDevice"]:checked')).map(i=>i.value).join(', ');
            const peripherals = Array.from(document.querySelectorAll('input[name="peripheral"]:checked')).map(i=>i.value).join(', ');
            const simTariff = document.getElementById('simTariff')?.value || '';
            const equipDesc = document.getElementById('equipDesc')?.value.trim() || '';
            const returnLocation = document.getElementById('returnLocation')?.value || '';

            extra = `\nФИО сотрудника: ${fioEmp}\nДолжность: ${posEmp}\nОтдел: ${deptEmp}\nРуководитель: ${mgrEmp}\nДата первого рабочего дня: ${startEmp}\nНаблюдатели: ${obsEmp}\n\nДоступы к сервисам: ${accessServices}\nПочтовая рассылка: ${mailList}\nГруппа Битрикс: ${bitrixGroup}\nСетевые папки: ${netFolders}\nБазы 1С: ${bases1c}\nБанковские сервисы: ${bankServices}\nДоступ к серверам: ${serversAccess}\n\nОсновные устройства: ${needIssue}\nПериферия: ${peripherals}\nSIM тариф: ${simTariff}\nОписание оборудования: ${equipDesc}\nГде получить: ${document.getElementById('receiveLocation')?.value || ''}\nГде сдавать: ${returnLocation}`;
        }

        const taskPayload = {
            queue: "ITHELP",
            summary: summaryVal,
            description: `Категория: ${requestMap[currentRequestKey]?.title}\nПодкатегория: ${subcat}\n---\n${descDetail}${extra}`,
            source: "web-form",
            requestType: currentRequestKey
        };
        console.log("✅ Яндекс Трекер: создана задача", taskPayload);
        alert(`✅ Задача создана в Яндекс Трекере!\n\nТема: ${summaryVal}\nТип: ${requestMap[currentRequestKey]?.title}\nПодкатегория: ${subcat}\n\n(интеграция с API Яндекс Трекера)`);
        closeModal();
        dynamicForm.reset();
        // cleanup step2
        const step2 = document.getElementById('step2Fields'); if (step2) step2.remove();
        modalStep = 1;
        setModalButtonsForStep(1);
    });

    // Password reset modal logic
    const resetBtn = document.getElementById('resetPasswordBtn');
    const pwModal = document.getElementById('pwResetModal');
    const closePw = document.getElementById('closePwModal');
    const pwForm = document.getElementById('pwResetForm');

    if (resetBtn && pwModal) {
        resetBtn.addEventListener('click', () => pwModal.classList.add('active'));
    }
    if (closePw && pwModal) closePw.addEventListener('click', () => pwModal.classList.remove('active'));
    if (pwModal) pwModal.addEventListener('click', (e) => { if (e.target === pwModal) pwModal.classList.remove('active'); });

