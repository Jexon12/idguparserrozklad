(function () {
  const SA = window.ScheduleApp, client = SA.StaffClient, editor = SA.SessionEditor;
  const container = document.getElementById('cloudWorkspace');
  let current = null, canEdit = true, busy = false, timer, users = [], accountGeneration = 0;
  const signature = payload => JSON.stringify({ fields: payload.fields, rows: payload.rows, publicationBaseline: payload.publicationBaseline });
  const status = message => { document.getElementById('cloudDraftStatus').textContent = message; };
  function remember() { try { if (current) localStorage.setItem('session_cloud_context_v1', JSON.stringify({ id: current.id, version: current.version, userId: client.user.id, signature: current.signature })); } catch (_) { /* Remote persistence does not depend on browser quota. */ } }
  async function refresh() {
    if (!client.user) { container.classList.add('hidden'); current = null; return; }
    const identity = client.user.id, generation = accountGeneration;
    container.classList.remove('hidden');
    const [result, colleagues] = await Promise.all([client.request('/api/staff/drafts'), client.request('/api/staff/users')]);
    if (client.user?.id !== identity || generation !== accountGeneration) return;
    users = colleagues.users;
    const select = document.getElementById('cloudDraftSelect'); const selected = current?.id || select.value;
    select.replaceChildren(new Option('Оберіть серверну чернетку', ''));
    const states = { draft: 'Чернетка', ready: 'На перевірці', published: 'Опубліковано' };
    result.drafts.forEach(draft => select.add(new Option(`${draft.title} · ${draft.count} записів · ${states[draft.status] || 'Чернетка'} · ${draft.updatedBy}`, draft.id)));
    if (current) select.value = selected;
    const share = document.getElementById('draftSharedWith'); share.replaceChildren();
    users.filter(user => user.id !== client.user.id).forEach(user => share.add(new Option(`${user.name} (${client.roleLabel(user.role)})`, user.id)));
    if (current) for (const option of share.options) option.selected = (current.sharedWith || []).includes(option.value);
    share.disabled = !!current && current.ownerId !== client.user.id && client.user.role !== 'admin';
    document.getElementById('saveCloudDraft').disabled = !canEdit;
    document.getElementById('submitCloudDraft').disabled = !canEdit;
  }
  async function save(copy = false, statusValue = 'draft') {
    if (!client.user) throw new Error('Увійдіть для серверного збереження');
    if (busy) throw new Error('Збереження вже виконується');
    if (!copy && !canEdit) throw new Error('Збережіть локальні зміни як нову копію');
    busy = true;
    const generation = accountGeneration;
    const payload = editor.getDraft();
    try {
      const result = await client.request(`/api/staff/drafts${!copy && current ? '/' + current.id : ''}`, { method: 'POST', body: JSON.stringify({
        payload, title: document.getElementById('cloudDraftTitle').value || payload.fields.sessionTerm,
        expectedVersion: !copy ? current?.version : undefined, status: statusValue,
        sharedWith: Array.from(document.getElementById('draftSharedWith').selectedOptions).map(option => option.value)
      }) });
      if (generation !== accountGeneration) return;
      current = { ...result.draft, signature: signature(payload) }; canEdit = true; remember();
      status(`Збережено на сервері · версія ${current.version} · ${current.updatedBy}${statusValue === 'ready' ? ' · передано на перевірку відповідальному' : ''}`);
      await refresh();
    } catch (error) { document.getElementById('cloudAutosave').checked = false; throw error; }
    finally { busy = false; }
  }
  const run = fn => async event => { event?.preventDefault(); try { await fn(); } catch (error) { status(`${error.message}. Локальні записи збережені в браузері.`); } };
  document.getElementById('saveCloudDraft').onclick = run(() => save());
  document.getElementById('copyCloudDraft').onclick = run(() => save(true));
  document.getElementById('submitCloudDraft').onclick = run(() => save(false, 'ready'));
  document.getElementById('refreshCloudDrafts').onclick = run(refresh);
  document.getElementById('openCloudDraft').onclick = run(async () => {
    const generation = accountGeneration;
    const draftId = document.getElementById('cloudDraftSelect').value; if (!draftId) throw new Error('Оберіть чернетку');
    if (editor.getDraft().rows.length && !confirm('Відкрити серверну чернетку замість локальних записів? За потреби спочатку збережіть локальну копію.')) return;
    const result = await client.request('/api/staff/drafts/' + draftId);
    if (generation !== accountGeneration) return;
    editor.applyDraft(result.draft.payload); current = { ...result.draft, signature: signature(editor.getDraft()) }; canEdit = result.canEdit;
    document.getElementById('cloudDraftTitle').value = current.title;
    const history = document.getElementById('cloudDraftVersion'); history.replaceChildren(new Option('Попередні версії', ''));
    (current.snapshots || []).slice().reverse().forEach(snapshot => history.add(new Option(`Версія ${snapshot.version} · ${snapshot.by}`, String(snapshot.version))));
    status(`Відкрито версію ${current.version}${canEdit ? '' : ' · перегляд; зміни можна зберегти як власну копію'}`); remember(); await refresh();
  });
  document.getElementById('restoreCloudDraftVersion').onclick = run(async () => {
    const version = Number(document.getElementById('cloudDraftVersion').value);
    const snapshot = current?.snapshots?.find(value => value.version === version);
    if (!snapshot) throw new Error('Оберіть попередню версію');
    clearTimeout(timer); document.getElementById('cloudAutosave').checked = false;
    editor.applyDraft(snapshot.payload); status(`Версію ${version} відкрито локально. Автозбереження вимкнено; збережіть її вручну для створення нової серверної версії.`);
  });
  window.addEventListener('session-draft-changed', () => {
    clearTimeout(timer);
    if (!current || !canEdit || !document.getElementById('cloudAutosave').checked || !client.user) return;
    timer = setTimeout(() => {
      if (current && current.signature !== signature(editor.getDraft())) save().catch(error => status(error.message));
    }, 2000);
  });
  SA.SessionWorkspace = {
    async preparePublication() {
      if (!current) return {};
      if (current.signature !== signature(editor.getDraft())) await save();
      return { draftId: current.id, expectedDraftVersion: current.version };
    },
    published(result) { if (current && result.draftVersion) { current.version = result.draftVersion; current.signature = signature(editor.getDraft()); current.status = 'published'; remember(); status(`Опубліковано серверну версію ${current.version}`); } }
  };
  window.addEventListener('staff-account-changed', () => {
    accountGeneration++; clearTimeout(timer); current = null; canEdit = true;
    document.getElementById('cloudDraftTitle').value = '';
    document.getElementById('cloudDraftVersion').replaceChildren(new Option('Попередні версії', ''));
    refresh().catch(error => status(error.message));
  });
  client.ready.then(async () => {
    await refresh();
    try {
      const saved = JSON.parse(localStorage.getItem('session_cloud_context_v1') || 'null');
      if (saved && saved.userId === client.user?.id) {
        const result = await client.request('/api/staff/drafts/' + saved.id);
        current = { ...result.draft, version: saved.version, signature: saved.signature }; canEdit = result.canEdit;
        status('Відновлено зв’язок локальних записів із серверною чернеткою. Перед збереженням буде перевірено її версію.'); await refresh();
      }
    } catch (_) { /* The local draft remains usable when an old server draft is unavailable. */ }
  }).catch(error => status(error.message));
})();
