(function () {
  if ((location.pathname === '/' || location.pathname.endsWith('/index.html')) && new URLSearchParams(location.search).get('staff') !== '1') return;
  const SA = window.ScheduleApp = window.ScheduleApp || {};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roles = { methodist: 'Методист', publisher: 'Відповідальний за публікацію', admin: 'Адміністратор' };
  const client = SA.StaffClient = {
    user: null, setupRequired: null,
    roleLabel: role => roles[role] || 'Персонал',
    async request(url, options = {}) {
      const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || `HTTP ${response.status}`), { status: response.status });
      return result;
    },
    async refresh() {
      const result = await this.request('/api/staff/auth/me');
      this.user = result.user || null; this.setupRequired = result.setupRequired; this.storage = result.storage;
      render();
      window.dispatchEvent(new CustomEvent('staff-account-changed', { detail: { user: this.user } }));
      return result;
    }
  };
  const panel = document.createElement('section'); panel.id = 'staffAccount';
  panel.className = 'rounded-2xl bg-white dark:bg-gray-800 p-4 shadow my-3';
  function render() {
    if (client.user) {
      const storageLabel = client.storage === 'local-db' ? 'локальний сервер' : 'централізоване сховище';
      panel.innerHTML = `<div class="flex flex-wrap items-center gap-3"><strong>${escape(client.user.name)}</strong><span>${roles[client.user.role]}</span><a href="/staff-settings.html" class="ui-btn">Правила та доступ</a><button id="staffSignOut" class="ui-btn">Вийти</button></div><p class="text-xs text-gray-500 mt-2">Робоче сховище: ${storageLabel}. Автор дій визначається обліковим записом.</p>`;
      panel.querySelector('#staffSignOut').onclick = async () => { await client.request('/api/staff/auth/logout', { method: 'POST', body: '{}' }); await client.refresh(); };
      return;
    }
    panel.innerHTML = `<details ${client.setupRequired ? 'open' : ''}><summary class="font-bold cursor-pointer">${client.setupRequired ? 'Початкове налаштування: створіть особистий обліковий запис адміністратора' : 'Увійти для серверних чернеток і спільної роботи'}</summary>
      <p class="text-sm text-gray-500 my-2">${client.setupRequired ? 'Після створення першого облікового запису спільний пароль більше не надає права на зміни. Далі налаштуйте правила установи та додайте колег.' : 'Методист готує чернетку; відповідальний публікує; адміністратор керує доступом і правилами.'}</p>
      <form id="staffSignIn" class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label>Логін<input name="username" autocomplete="username" required class="ui-input block w-full dark:bg-gray-700" pattern="[a-zA-Z0-9._@-]{3,80}"></label>
        ${client.setupRequired ? '<label>Ім’я та прізвище<input name="name" autocomplete="name" required class="ui-input block w-full dark:bg-gray-700"></label><label>Пароль первинного налаштування<input name="setupPassword" type="password" required class="ui-input block w-full dark:bg-gray-700" autocomplete="off"></label>' : ''}
        <label>Особистий пароль<input name="password" type="password" autocomplete="${client.setupRequired ? 'new-password' : 'current-password'}" ${client.setupRequired ? 'minlength="12"' : ''} required class="ui-input block w-full dark:bg-gray-700"></label>
        <button type="submit" class="ui-btn ui-btn-primary self-end">${client.setupRequired ? 'Створити адміністратора' : 'Увійти'}</button>
        <p id="staffAuthStatus" role="alert" class="text-sm md:col-span-3"></p>
      </form></details>`;
    panel.querySelector('#staffSignIn').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true;
      const status = panel.querySelector('#staffAuthStatus'); status.textContent = 'Перевірка…';
      try {
        await client.request(`/api/staff/auth/${client.setupRequired ? 'bootstrap' : 'login'}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        await client.refresh();
      } catch (error) { status.textContent = error.message; }
      finally { form.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; }); button.disabled = false; }
    };
  }
  const header = document.querySelector('header');
  if (header) header.after(panel); else document.body.prepend(panel);
  client.ready = client.refresh().catch(error => { panel.textContent = `Облікові записи недоступні: ${error.message}`; return { user: null }; });
})();
