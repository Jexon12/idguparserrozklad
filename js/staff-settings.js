(function () {
  const client = window.ScheduleApp.StaffClient;
  const rulesForm = document.getElementById('rulesForm'), accountForm = document.getElementById('accountForm');
  let version, restorePreview = null;
  const status = message => { document.getElementById('settingsStatus').textContent = message; };
  async function refresh() {
    const result = await client.request('/api/staff/rules'); version = result.version;
    for (const input of rulesForm.elements) if (input.name) { if (input.type === 'checkbox') input.checked = !!result.rules[input.name]; else input.value = result.rules[input.name] ?? ''; }
    const admin = client.user?.role === 'admin';
    document.getElementById('personalPasswordPanel').classList.toggle('hidden', !client.user);
    for (const input of rulesForm.elements) input.disabled = !admin;
    document.getElementById('accountsPanel').classList.toggle('hidden', !admin);
    document.getElementById('staffBackupPanel').classList.toggle('hidden', !admin);
    if (!admin) return;
    const users = await client.request('/api/staff/users');
    const list = document.getElementById('accountsList'); list.replaceChildren();
    users.users.forEach(user => {
      const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.className = 'ui-btn';
      button.textContent = `${user.name} · ${user.username} · ${client.roleLabel(user.role)}${user.disabled ? ' · вимкнено' : ''}`;
      button.onclick = () => { for (const input of accountForm.elements) if (input.name) { if (input.type === 'checkbox') input.checked = !!user[input.name]; else input.value = user[input.name] || ''; } };
      li.append(button); list.append(li);
    });
  }
  const run = fn => async event => { event?.preventDefault(); try { await fn(); } catch (error) { status(error.message); } };
  document.getElementById('personalPasswordForm').onsubmit = run(async () => {
    const form = document.getElementById('personalPasswordForm');
    await client.request('/api/staff/auth/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); status('Пароль змінено. Увійдіть з новим паролем.'); await client.refresh();
  });
  rulesForm.onsubmit = run(async () => {
    const rules = Object.fromEntries(new FormData(rulesForm)); rules.enforcePlanningRules = rulesForm.elements.enforcePlanningRules.checked;
    await client.request('/api/staff/rules', { method: 'POST', body: JSON.stringify({ rules, expectedVersion: version }) });
    status('Правила збережено. Конструктор використовує їх при наступній перевірці.'); await refresh();
  });
  accountForm.onsubmit = run(async () => {
    const data = Object.fromEntries(new FormData(accountForm)); data.disabled = accountForm.elements.disabled.checked;
    await client.request('/api/staff/users', { method: 'POST', body: JSON.stringify(data) });
    accountForm.reset(); status('Обліковий запис збережено'); await client.refresh();
  });
  document.getElementById('newAccountBtn').onclick = () => accountForm.reset();
  async function download(data, name) {
    let blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (window.CompressionStream) { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); name += '.gz'; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }
  document.getElementById('exportStaffBackup').onclick = run(async () => download(await client.request('/api/staff/backup'), 'staff-backup.json'));
  document.getElementById('exportPreviousStaffBackup').onclick = run(async () => { const data = await client.request('/api/staff/backup/previous'); if (!data.data) throw new Error('Попередньої копії немає'); download(data, 'staff-before-restore.json'); });
  document.getElementById('previewStaffRestore').onclick = run(async () => {
    restorePreview = null; document.getElementById('restoreStaffBackup').disabled = true;
    const file = document.getElementById('staffBackupFile').files[0]; if (!file || file.size > 64 * 1024 * 1024) throw new Error('Оберіть копію до 64 МБ');
    let blob = file;
    if (!file.name.endsWith('.gz') && window.CompressionStream) blob = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    let encoded;
    if (file.name.endsWith('.gz') || window.CompressionStream) {
      const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.slice(i, i + 16384));
      encoded = { compressedBackup: btoa(binary) };
    } else encoded = { backup: JSON.parse(await file.text()) };
    if (JSON.stringify(encoded).length > 1900000) throw new Error('Стиснена копія перевищує ліміт запиту. Збережіть чернетки окремими файлами.');
    const current = await client.request('/api/staff/rules');
    const preview = await client.request('/api/staff/backup', { method: 'POST', body: JSON.stringify({ ...encoded, preview: true, expectedVersion: current.stateVersion ?? current.version }) });
    restorePreview = { ...encoded, expectedVersion: preview.version };
    document.getElementById('restoreSummary').textContent = `Буде відновлено користувачів: ${preview.users}, чернеток: ${preview.drafts}. Поточні дані буде замінено.`;
    document.getElementById('restoreAcknowledged').checked = false;
  });
  document.getElementById('staffBackupFile').onchange = () => { restorePreview = null; document.getElementById('restoreStaffBackup').disabled = true; };
  document.getElementById('restoreAcknowledged').onchange = event => { document.getElementById('restoreStaffBackup').disabled = !restorePreview || !event.target.checked; };
  document.getElementById('restoreStaffBackup').onclick = run(async () => {
    if (!restorePreview || !document.getElementById('restoreAcknowledged').checked) throw new Error('Спочатку перевірте копію');
    await client.request('/api/staff/backup', { method: 'POST', body: JSON.stringify(restorePreview) });
    restorePreview = null; status('Копію відновлено. Увійдіть знову.'); await client.refresh();
  });
  window.addEventListener('staff-account-changed', () => {
    accountForm.reset(); document.getElementById('personalPasswordForm').reset();
    restorePreview = null; document.getElementById('restoreAcknowledged').checked = false;
    document.getElementById('restoreStaffBackup').disabled = true;
    refresh().catch(error => status(error.message));
  });
  client.ready.then(() => refresh()).catch(error => status(error.message));
})();
