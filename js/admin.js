/**
 * Schedule Viewer - Admin Module
 * Admin authentication, global links management, and global times management.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    // Password is kept in closure, not in reactive state.
    let _adminPassword = '';

    SA.toggleAdminLogin = async (refs) => {
        if (refs.adminMode.value) {
            refs.adminMode.value = false;
            _adminPassword = '';
            refs.adminPassword.value = '';
            return;
        }

        const pwd = prompt('Введіть пароль адміністратора:');
        if (!pwd) return;

        try {
            const res = await fetch('/api/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
            });

            if (res.ok) {
                refs.adminMode.value = true;
                _adminPassword = pwd;
                refs.adminPassword.value = '';
                alert('Режим адміністратора активовано.');
            } else {
                alert('Невірний пароль');
            }
        } catch (e) {
            alert('Помилка мережі при перевірці пароля');
        }
    };

    SA.getGlobalKey = (lesson) => {
        const safe = (s) => (s || '').replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
        return `${safe(lesson.discipline)}_${safe(lesson.group)}_${safe(lesson.type)}`;
    };

    SA.loadGlobalLinks = async (refs) => {
        try {
            const res = await fetch('/api/links');
            if (res.ok) refs.globalLinks.value = await res.json();
        } catch (e) {
            console.error('Failed to load global links', e);
        }
    };

    SA.openAdminModal = (lesson, refs) => {
        const key = SA.getGlobalKey(lesson);
        refs.adminTargetKey.value = key;
        refs.adminTargetTitle.value = `${lesson.discipline} (${lesson.group})`;

        const existing = refs.globalLinks.value[key] || {};
        refs.adminForm.value = {
            courseUrl: existing.courseUrl || '',
            onlineUrl: existing.onlineUrl || ''
        };
        refs.showAdminModal.value = true;
    };

    SA.saveAdminLinks = async (refs) => {
        const key = refs.adminTargetKey.value;
        const val = { ...refs.adminForm.value };

        if (!refs.globalLinks.value[key]) refs.globalLinks.value[key] = {};
        refs.globalLinks.value[key] = val;

        try {
            const res = await fetch('/api/links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: _adminPassword, key, value: val })
            });

            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                alert(`Помилка: статус ${res.status}, не-JSON відповідь`);
                refs.showAdminModal.value = false;
                return;
            }

            if (!res.ok) {
                alert(`Помилка збереження (${res.status}): ${data.error || JSON.stringify(data)}`);
            } else {
                alert('Збережено успішно');
            }
        } catch (e) {
            alert('Помилка мережі');
        }

        refs.showAdminModal.value = false;
    };

    SA.loadGlobalTimes = async (refs) => {
        try {
            const res = await fetch('/api/times');
            if (!res.ok) return;
            const times = await res.json();
            if (times && Object.keys(times).length > 0) refs.customTimes.value = times;
        } catch (e) {
            console.error('Failed to load global times', e);
        }
    };

    SA.saveGlobalTimes = async (refs) => {
        if (!refs.adminMode.value) return;

        try {
            const res = await fetch('/api/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: _adminPassword, times: refs.customTimes.value })
            });

            if (res.ok) {
                alert('Час збережено глобально для всіх користувачів');
            } else {
                const data = await res.json();
                alert('Помилка збереження: ' + (data.error || 'Невідома помилка'));
            }
        } catch (e) {
            alert('Помилка мережі при збереженні часу');
        }
    };

    SA.getGlobalLink = (lesson, type, refs) => {
        const key = SA.getGlobalKey(lesson);
        return refs.globalLinks.value[key] ? refs.globalLinks.value[key][type] : null;
    };
})(window.ScheduleApp);
