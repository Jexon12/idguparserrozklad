(function (SA) {
    SA.watchForUpdate = registration => {
        let requested = false;
        let reloaded = false;
        let timeout;
        let label, button;
        let stopWatching = () => {};
        const reload = () => {
            if (!requested || reloaded) return;
            reloaded = true;
            clearTimeout(timeout);
            stopWatching();
            window.location.reload();
        };
        const failed = () => {
            requested = false;
            clearTimeout(timeout);
            stopWatching();
            label.textContent = 'Не вдалося завершити оновлення. Спробуйте ще раз або перезавантажте сторінку. ';
            button.disabled = false;
            button.textContent = 'Спробувати ще раз';
        };
        const update = () => {
            if (requested || reloaded) return;
            requested = true;
            button.disabled = true;
            button.textContent = 'Оновлюємо…';
            label.textContent = 'Застосовуємо нову версію… ';
            // Another tab may already have activated the worker since the notice appeared.
            const worker = registration.waiting || (registration.active?.state === 'activating' ? registration.active : null);
            if (!worker) { reload(); return; }
            const onState = () => {
                if (worker.state === 'activated') reload();
                else if (worker.state === 'redundant') failed();
            };
            worker.addEventListener('statechange', onState);
            stopWatching = () => worker.removeEventListener('statechange', onState);
            timeout = setTimeout(() => {
                if (worker.state === 'activated') reload();
                else failed();
            }, 12000);
            try {
                if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
                onState();
            } catch (_) { failed(); }
        };
        const show = () => {
            if (!registration.waiting || document.getElementById('app-update-notice')) return;
            const notice = document.createElement('aside');
            notice.id = 'app-update-notice';
            notice.setAttribute('aria-label', 'Оновлення застосунку');
            notice.className = 'app-update-notice';
            label = document.createElement('span');
            label.setAttribute('role', 'status');
            label.textContent = 'Доступна нова версія. Збережіть незавершені зміни: оновлення перезавантажить сторінку. ';
            button = document.createElement('button'); button.type = 'button'; button.textContent = 'Оновити';
            button.addEventListener('click', update);
            notice.append(label, button); document.body.append(notice);
        };
        navigator.serviceWorker.addEventListener('controllerchange', reload);
        show();
        const watchInstalling = () => {
            registration.installing?.addEventListener('statechange', show);
        };
        watchInstalling();
        registration.addEventListener('updatefound', watchInstalling);
    };
})(window.ScheduleApp);
