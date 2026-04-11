document.addEventListener('DOMContentLoaded', () => {
	window.MattMesterChatModal?.init();

	document.addEventListener('click', (event) => {
		const trigger = event.target.closest('[data-open-chat="inbox"]');
		if (trigger) {
			window.MattMesterChatModal?.openInbox?.().catch((error) => {
				console.error('GameRoom chat megnyitasi hiba:', error);
			});
		}
	});
});
