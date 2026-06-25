// Cards filtering and UI helpers
document.addEventListener('DOMContentLoaded', () => {
	const searchInput = document.getElementById('cardSearch');

	function getCards() {
		return Array.from(document.querySelectorAll('.service-card'));
	}

	function getGroups() {
		return Array.from(document.querySelectorAll('.section-group'));
	}

	function filterCards() {
		const q = (searchInput && searchInput.value || '').trim().toLowerCase();

		// If query empty — show everything
		if (!q) {
			getCards().forEach(card => card.style.display = '');
			getGroups().forEach(group => group.style.display = '');
			return;
		}

		getCards().forEach(card => {
			const title = (card.dataset.title || '') + ' ' + (card.querySelector('.card-title')?.textContent || '');
			const desc = card.querySelector('.card-desc')?.textContent || '';
			const badge = card.querySelector('.badge-tracker')?.textContent || '';
			const full = (title + ' ' + desc + ' ' + badge + ' ' + card.textContent).toLowerCase();

			if (full.includes(q)) card.style.display = '';
			else card.style.display = 'none';
		});

		// Hide groups that have no visible cards
		getGroups().forEach(group => {
			const visible = Array.from(group.querySelectorAll('.service-card')).some(c => {
				return window.getComputedStyle(c).display !== 'none';
			});
			group.style.display = visible ? '' : 'none';
		});
	}

	if (searchInput) {
		searchInput.addEventListener('input', filterCards);
	}
});