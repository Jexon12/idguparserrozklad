/** Common navigation with a strict public/staff information boundary. */
(function (root) {
    if (!root || !root.document) return;
    root.ScheduleApp = root.ScheduleApp || {};
    const SA = root.ScheduleApp;
    const ROLE_KEY = 'schedule_user_role_v1';
    const publicRoles = {
        student: { label: 'Студент', links: [['Розклад', '/index.html'], ['Мій день', '/index.html?desktop=1#smart-day'], ['Сесія', '/session.html']] },
        teacher: { label: 'Викладач', links: [['Розклад', '/index.html'], ['Мій день', '/index.html?desktop=1#smart-day'], ['Сесія', '/session.html']] }
    };
    const staffPaths = new Set(['/staff.html', '/builder.html', '/course-live.html', '/session-constructor.html', '/session-admin.html']);
    const staffLinks = [
        ['Огляд', '/staff.html'],
        ['Course Day', '/course-live.html'],
        ['Week Builder', '/builder.html'],
        ['Конструктор сесії', '/session-constructor.html'],
        ['Адмін сесій', '/session-admin.html']
    ];
    let badge;
    let retryButton;

    const renderFreshness = (state = {}) => {
        if (!badge) return;
        const sourceLabels = { api: 'API', cache: 'cache', offline: 'offline', local: 'local', error: 'помилка' };
        const source = sourceLabels[state.source] || 'очікування';
        const time = state.at ? new Date(state.at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '';
        badge.textContent = `Дані: ${source}${time ? ` · ${time}` : ''}`;
        badge.className = `text-[11px] px-2 py-1 rounded-full ${state.source === 'error' ? 'bg-rose-100 text-rose-700' : state.source === 'offline' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`;
        if (retryButton) retryButton.classList.toggle('hidden', !['error', 'offline'].includes(state.source));
    };

    SA.DataFreshness = {
        state: { source: navigator.onLine ? '' : 'offline', at: null },
        mark(source, at = Date.now()) {
            this.state = { source, at };
            renderFreshness(this.state);
        }
    };

    const createLink = ([label, href]) => {
        const anchor = document.createElement('a');
        anchor.textContent = label;
        anchor.href = href;
        anchor.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-700 hover:bg-amber-100 dark:hover:bg-amber-900/30';
        return anchor;
    };

    const renderLinks = (container, role) => {
        container.replaceChildren(...publicRoles[role].links.map(createLink));
    };

    document.addEventListener('DOMContentLoaded', () => {
        const shell = document.createElement('nav');
        shell.setAttribute('aria-label', 'Навігація за ролями');
        shell.className = 'mx-auto max-w-7xl px-3 md:px-6 pt-3 flex flex-wrap items-center gap-2';
        const isStaff = staffPaths.has(location.pathname.toLowerCase()) || new URLSearchParams(location.search).get('staff') === '1';
        if (isStaff) {
            const label = document.createElement('span');
            label.textContent = '🔒 Для персоналу';
            label.className = 'px-2 py-1 rounded-lg text-xs font-black bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900';
            const links = document.createElement('div');
            links.className = 'flex flex-wrap gap-1';
            links.replaceChildren(...staffLinks.map(createLink));
            const publicLink = createLink(['Публічний розклад', '/index.html']);
            publicLink.className += ' ml-auto';
            shell.append(label, links, publicLink);
            badge = document.createElement('span');
            retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.textContent = 'Повторити';
            retryButton.className = 'hidden text-[11px] px-2 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold';
            retryButton.addEventListener('click', () => location.reload());
            if (location.pathname.toLowerCase() !== '/staff.html') shell.append(badge, retryButton);
            document.body.insertBefore(shell, document.body.firstChild);
            renderFreshness(SA.DataFreshness.state);
            return;
        }

        const audienceLabel = document.createElement('span');
        audienceLabel.textContent = 'Я:';
        audienceLabel.className = 'text-xs text-gray-500 dark:text-gray-400';
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Роль користувача');
        select.className = 'rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold';
        Object.entries(publicRoles).forEach(([key, config]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = config.label;
            select.appendChild(option);
        });
        const storedRole = localStorage.getItem(ROLE_KEY);
        select.value = publicRoles[storedRole] ? storedRole : 'student';
        const links = document.createElement('div');
        links.className = 'flex flex-wrap gap-1';
        badge = document.createElement('span');
        retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.textContent = 'Повторити';
        retryButton.className = 'hidden text-[11px] px-2 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold';
        retryButton.addEventListener('click', () => location.reload());
        select.addEventListener('change', () => {
            localStorage.setItem(ROLE_KEY, select.value);
            renderLinks(links, select.value);
        });
        renderLinks(links, select.value);
        const staffLink = createLink(['Для персоналу', '/staff.html']);
        staffLink.className = 'ml-auto px-2 py-1 rounded-lg text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white';
        shell.append(audienceLabel, select, links, badge, retryButton, staffLink);
        document.body.insertBefore(shell, document.body.firstChild);
        renderFreshness(SA.DataFreshness.state);
    });

    root.addEventListener('offline', () => SA.DataFreshness.mark('offline'));
    root.addEventListener('online', () => SA.DataFreshness.mark('api'));
})(typeof window !== 'undefined' ? window : null);
