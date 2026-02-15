/**
 * Schedule Viewer — Admin Module
 * Admin authentication, global links management, and global times management.
 */
window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    /**
     * Toggle admin login with server-side password validation.
     * @param {Object} refs - { adminMode, adminPassword }
     */
    SA.toggleAdminLogin = async (refs) => {
        if (refs.adminMode.value) {
            refs.adminMode.value = false;
            refs.adminPassword.value = '';
            return;
        }
        const pwd = prompt("Введіть пароль адміністратора:");
        if (!pwd) return;

        try {
            const res = await fetch('/api/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd, times: {} })
            });
            if (res.ok) {
                refs.adminMode.value = true;
                refs.adminPassword.value = pwd;
                alert("Режим адміна активовано! Тепер ви бачите олівці для редагування.");
            } else {
                alert("Невірний пароль");
            }
        } catch (e) {
            alert("Помилка мережі при перевірці пароля");
        }
    };

    SA.getGlobalKey = (lesson) => {
        const safe = (s) => (s || '').replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
        return `${safe(lesson.discipline)}_${safe(lesson.group)}_${safe(lesson.type)}`;
    };

    SA.loadGlobalLinks = async (refs) => {
        try {
            const res = await fetch('/api/links');
            if (res.ok) {
                refs.globalLinks.value = await res.json();
            }
        } catch (e) {
            console.error("Failed to load global links", e);
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
                body: JSON.stringify({
                    password: refs.adminPassword.value,
                    key: key,
                    value: val
                })
            });
            let data;
            try {
                data = await res.json();
            } catch (err) {
                alert(`Помилка: Статус ${res.status}. Відповідь не є JSON.`);
                return;
            }

            if (!res.ok) {
                alert(`Помилка збереження (${res.status}): ${data.error || JSON.stringify(data)}`);
            } else {
                alert("Збережено успішно!");
            }
        } catch (e) {
            alert("Помилка мережі");
        }
        refs.showAdminModal.value = false;
    };

    SA.loadGlobalTimes = async (refs) => {
        try {
            const res = await fetch('/api/times');
            if (res.ok) {
                const times = await res.json();
                if (times && Object.keys(times).length > 0) {
                    refs.customTimes.value = times;
                }
            }
        } catch (e) {
            console.error("Failed to load global times", e);
        }
    };

    SA.saveGlobalTimes = async (refs) => {
        if (!refs.adminMode.value) return;

        try {
            const res = await fetch('/api/times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: refs.adminPassword.value,
                    times: refs.customTimes.value
                })
            });

            if (res.ok) {
                alert("Час збережено глобально для всіх користувачів!");
            } else {
                const data = await res.json();
                alert("Помилка збереження: " + (data.error || "Невідома помилка"));
            }
        } catch (e) {
            alert("Помилка мережі при збереженні часу");
        }
    };

    SA.getGlobalLink = (lesson, type, refs) => {
        const key = SA.getGlobalKey(lesson);
        if (refs.globalLinks.value[key]) {
            return refs.globalLinks.value[key][type];
        }
        return null;
    };
})(window.ScheduleApp);
