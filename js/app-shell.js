/** Common role navigation and data freshness indicator. */
(function (root) {
    if (!root || !root.document) return;
    root.ScheduleApp = root.ScheduleApp || {};
    const SA = root.ScheduleApp;
    const ROLE_KEY = 'schedule_user_role_v1';
    const roles = {
        student: { label: 'Студент', links: [['Розклад', '/index.html'], ['Сесія', '/session.html']] },
        teacher: { label: 'Викладач', links: [['Розклад', '/index.html'], ['Smart Day', '/index.html?desktop=1#smart-day'], ['Сесія', '/session.html']] },
        dispatcher: { label: 'Диспетчер', links: [['Course Live', '/course-live.html'], ['Week Builder', '/builder.html'], ['Розклад', '/index.html']] },
        admin: { label: 'Адміністратор', links: [['Constructor', '/session-constructor.html'], ['Session Admin', '/session-admin.html'], ['Перегляд', '/session.html']] }
    };
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
        container.replaceChildren(...roles[role].links.map(createLink));
    };

    document.addEventListener('DOMContentLoaded', () => {
        const shell = document.createElement('nav');
        shell.setAttribute('aria-label', 'Навігація за ролями');
        shell.className = 'mx-auto max-w-7xl px-3 md:px-6 pt-3 flex flex-wrap items-center gap-2';
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Роль користувача');
        select.className = 'rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold';
        Object.entries(roles).forEach(([key, config]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = config.label;
            select.appendChild(option);
        });
        const storedRole = localStorage.getItem(ROLE_KEY);
        select.value = roles[storedRole] ? storedRole : 'student';
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
        shell.append(select, links, badge, retryButton);
        document.body.insertBefore(shell, document.body.firstChild);
        renderFreshness(SA.DataFreshness.state);
    });

    root.addEventListener('offline', () => SA.DataFreshness.mark('offline'));
    root.addEventListener('online', () => SA.DataFreshness.mark('api'));
})(typeof window !== 'undefined' ? window : null);
