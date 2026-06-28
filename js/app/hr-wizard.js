/** HR two-step wizard (шаг 2 — сервисы, доступы, оборудование). */
window.PortalAppHrWizard = (function () {
    function renderStep2(container, onNetFolderCounterInit) {
        if (!container || document.getElementById('step2Fields')) return 0;

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

        let netFolderCounter = 0;
        const first = step2.querySelector('.net-folder-item');
        if (first) {
            netFolderCounter += 1;
            first.querySelectorAll('input[type="radio"]').forEach((radio) => {
                radio.name = `netDisk_${netFolderCounter}`;
            });
        }

        const addBtn = document.getElementById('addNetFolderBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const wrap = document.getElementById('netFoldersWrap');
                netFolderCounter += 1;
                const node = document.createElement('div');
                node.className = 'net-folder-item step2-box';
                node.innerHTML = `<div class="step2-disk-title">Буква диска</div>
                    <label><input type="radio" value="T"> Диск T</label>
                    <label><input type="radio" value="R"> Диск R</label>
                    <div class="step2-input-wrap"><input type="text" name="netPath" placeholder="Расположение, или наименование папки"></div>`;
                node.querySelectorAll('input[type="radio"]').forEach((radio) => {
                    radio.name = `netDisk_${netFolderCounter}`;
                });
                wrap.appendChild(node);
            });
        }

        if (typeof onNetFolderCounterInit === 'function') {
            onNetFolderCounterInit(netFolderCounter);
        }
        return netFolderCounter;
    }

    function buildHrNewExtra() {
        const fioEmp = document.getElementById('fioEmployee')?.value.trim() || '';
        const posEmp = document.getElementById('positionEmployee')?.value.trim() || '';
        const deptEmp = document.getElementById('departmentEmployee')?.value.trim() || '';
        const mgrEmp = document.getElementById('managerEmployee')?.value.trim() || '';
        const startEmp = document.getElementById('startDateEmployee')?.value.trim() || '';
        const obsEmp = document.getElementById('observersEmployee')?.value.trim() || '';
        const accessServices = Array.from(document.querySelectorAll('input[name="accessService"]:checked')).map((i) => i.value).join(', ');
        const mailList = document.getElementById('mailList')?.value.trim() || '';
        const bitrixGroup = document.getElementById('bitrixGroup')?.value.trim() || '';
        const netFolders = Array.from(document.querySelectorAll('.net-folder-item')).map((node) => {
            const disk = node.querySelector('input[type="radio"]:checked')?.value || '';
            const path = node.querySelector('input[name="netPath"]')?.value.trim() || '';
            return disk || path ? `${disk}:${path}` : '';
        }).filter(Boolean).join('; ');
        const bases1c = Array.from(document.querySelectorAll('input[name="base1c"]:checked')).map((i) => i.value).join(', ');
        const bankServices = Array.from(document.querySelectorAll('input[name="bankService"]:checked')).map((i) => i.value).join(', ');
        const serversAccess = document.getElementById('serversAccess')?.value.trim() || '';
        const mainDevices = Array.from(document.querySelectorAll('input[name="mainDevice"]:checked')).map((i) => i.value).join(', ');
        const peripherals = Array.from(document.querySelectorAll('input[name="peripheral"]:checked')).map((i) => i.value).join(', ');
        const simTariff = document.getElementById('simTariff')?.value || '';
        const equipDesc = document.getElementById('equipDesc')?.value.trim() || '';
        const returnLocation = document.getElementById('returnLocation')?.value || '';
        const needIssue = document.querySelector('input[name="needIssue"]:checked') ? 'Да' : 'Нет';
        const needReturn = document.querySelector('input[name="needReturn"]:checked') ? 'Да' : 'Нет';
        const computerName = document.getElementById('computerName')?.value.trim() || '';
        const placeWrite = document.getElementById('placeWrite')?.value.trim() || '';

        return `\nФИО сотрудника: ${fioEmp}\nДолжность: ${posEmp}\nОтдел: ${deptEmp}\nРуководитель: ${mgrEmp}\nДата первого рабочего дня: ${startEmp}\nНаблюдатели: ${obsEmp}\n\nДоступы к сервисам: ${accessServices}\nПочтовая рассылка: ${mailList}\nГруппа Битрикс: ${bitrixGroup}\nСетевые папки: ${netFolders}\nБазы 1С: ${bases1c}\nБанковские сервисы: ${bankServices}\nДоступ к серверам: ${serversAccess}\n\nВыдавать оборудование: ${needIssue}\nСдавать оборудование: ${needReturn}\nИмя компьютера: ${computerName}\nМесто (уточнение): ${placeWrite}\nОсновные устройства: ${mainDevices}\nПериферия: ${peripherals}\nSIM тариф: ${simTariff}\nОписание оборудования: ${equipDesc}\nГде получить: ${document.getElementById('receiveLocation')?.value || ''}\nГде сдавать: ${returnLocation}`;
    }

    return { renderStep2, buildHrNewExtra };
})();
