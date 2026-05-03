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
});
