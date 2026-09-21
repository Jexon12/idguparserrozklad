(function (SA) {
    SA.watchForUpdate = registration => {
        let reloading = false;
        const show = () => {
            if (!registration.waiting || document.getElementById('app-update-notice')) return;
            const notice = document.createElement('aside');
            notice.id = 'app-update-notice';
            notice.setAttribute('aria-label', 'Оновлення застосунку');
            notice.className = 'app-update-notice';
            const label = document.createElement('span'); label.textContent = 'Доступна нова версія. ';
            const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Оновити';
            button.addEventListener('click', () => {
                if (!window.confirm('Перезавантажити застосунок? Спочатку збережіть незавершені зміни.')) return;
                reloading = true; registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
            });
            notice.append(label, button); document.body.append(notice);
        };
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) window.location.reload(); });
        show();
        registration.addEventListener('updatefound', () => {
            registration.installing?.addEventListener('statechange', show);
        });
    };
})(window.ScheduleApp);
