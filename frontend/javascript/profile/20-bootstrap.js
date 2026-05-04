document.addEventListener('DOMContentLoaded', () => {
    runSafely('profileDOMContentLoadedBindings', () => {
        window.MattMesterChatModal?.init();
        bindGlobalChatLaunchers();
        bindNotificationCenterEvents();
        bindLogoutButton();
        bindTopBarPlayerSearchValidation();
        bindModalPlayerSearchValidation();
        bindSearchResultsModalEvents();
        bindFriendsSectionEvents();
        bindProfileDeleteModalEvents();
        bindProfileImageUploadEvents();
        bindRemoveAvatarEvents();
        bindCrossTabProfileRefreshEvents();
        bindSecurityActivityEvents();
        bindLogoutAllDevicesButton();
        bindAccountStatusEvents();
    });

    runSafelyAsync('profileInitialLoadSequence', async () => {
        await syncSocketContextForStartup('profile-initial-load');
        await refreshAuthUi('profile-initial-load');
        await refreshFriendsList(FRIEND_FILTER_DEFAULT);
        await refreshSecurityActivity();
        await loadAbilitiesUsage();
    });

    // i18n: nyelvváltáskor az összes dinamikusan generált szöveget újra-render eljük.
    if (window.MattMesterI18n?.onLangChange) {
        window.MattMesterI18n.onLangChange(() => {
            try { window.MattMesterI18n.applyAll?.(); } catch (_) {}
            try { renderFriendsList(friendsState.items); } catch (_) {}
            try { renderSecurityActivityTable(); } catch (_) {}
            try { renderNotificationCenterList(); } catch (_) {}
            try { refreshAuthUi('lang-change'); } catch (_) {}
            try { window.MattMesterProfileDashboard?.reload?.(); } catch (_) {}
            try { loadAbilitiesUsage(); } catch (_) {}
            // Egyedi event modulok hallgathatnak rá ha kell.
            try { window.dispatchEvent(new CustomEvent('mm:profile:rerender')); } catch (_) {}
        });
    }
});
