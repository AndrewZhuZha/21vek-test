
// Form helpers (equipment-related fields were removed)
// Добавлена отправка данных формы сброса пароля в трекер через webhook.
document.addEventListener('DOMContentLoaded', () => {
	const pwForm = document.getElementById('pwResetForm');
	const pwModal = document.getElementById('pwResetModal');
	const closeBtn = document.getElementById('closePwModal');

	closeBtn?.addEventListener('click', () => {
		pwModal.classList.remove('active');
	});

	pwForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const targetFio = document.getElementById('targetFio').value.trim();
		const requesterFio = document.getElementById('requesterFio').value.trim();
		const resetReason = document.getElementById('resetReason').value.trim();

		if (!targetFio || !requesterFio || !resetReason) {
			alert('Заполните все обязательные поля.');
			return;
		}

		// Подключение реального webhook трекера.
		// URL и токен можно указать в index.html или сохранить в localStorage.
		let webhookUrl = window.TRACKER_WEBHOOK_URL || localStorage.getItem('TRACKER_WEBHOOK_URL');
		let webhookToken = window.TRACKER_WEBHOOK_TOKEN || localStorage.getItem('TRACKER_WEBHOOK_TOKEN');
		const authType = window.TRACKER_WEBHOOK_AUTH_TYPE || 'OAuth';

		if (!webhookUrl) {
			const entered = prompt('Введите URL webhook для трекера (или вставьте сюда):');
			if (!entered) { alert('Webhook URL не указан. Операция отменена.'); return; }
			webhookUrl = entered;
			window.TRACKER_WEBHOOK_URL = entered;
			localStorage.setItem('TRACKER_WEBHOOK_URL', entered);
		}

		if (!webhookToken) {
			const enteredToken = prompt('Введите токен webhook для трекера (или вставьте сюда):');
			if (!enteredToken) { alert('Токен не указан. Операция отменена.'); return; }
			webhookToken = enteredToken;
			window.TRACKER_WEBHOOK_TOKEN = enteredToken;
			localStorage.setItem('TRACKER_WEBHOOK_TOKEN', enteredToken);
		}

		const payload = {
			title: `Сброс пароля — ${targetFio}`,
			description: `Кому: ${targetFio}\nКто запрашивает: ${requesterFio}\n\nПричина:\n${resetReason}`,
			requester: requesterFio,
			type: 'pw_reset'
		};

		try {
			const headers = { 'Content-Type': 'application/json' };
			if (webhookToken) headers['Authorization'] = `${authType} ${webhookToken}`;

			console.log('Sending webhook to', webhookUrl, 'authType', authType, 'payload', payload);
			const resp = await fetch(webhookUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload),
				mode: 'cors'
			});

			if (!resp.ok) {
				const text = await resp.text().catch(()=>resp.statusText);
				throw new Error(`${resp.status} ${resp.statusText}: ${text}`);
			}

			alert('Заявка успешно отправлена в трекер.');
			pwForm.reset();
			pwModal.classList.remove('active');
		} catch (err) {
			console.error('Webhook error', err);
			alert('Ошибка при отправке заявки: ' + err.message + '\n' +
				'Проверьте URL webhook, токен и настройки CORS/доступа на стороне сервера.');
		}
	});
});
