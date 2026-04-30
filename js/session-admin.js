(function () {
  const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const MAX_FILES = 25;
  const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

  const els = {
    password: document.getElementById('adminPassword'),
    actor: document.getElementById('adminActor'),
    term: document.getElementById('sessionTerm'),
    studyForm: document.getElementById('studyForm'),
    files: document.getElementById('docxFiles'),
    parseBtn: document.getElementById('parseFiles'),
    uploadBtn: document.getElementById('uploadData'),
    exportBackup: document.getElementById('exportBackup'),
    status: document.getElementById('adminStatus'),
    fileCount: document.getElementById('fileCount'),
    itemCount: document.getElementById('itemCount'),
    groupPreview: document.getElementById('groupPreview'),
    parseProgressBar: document.getElementById('parseProgressBar'),
    parseProgressText: document.getElementById('parseProgressText'),
    existingTerms: document.getElementById('existingTerms'),
    refreshTerms: document.getElementById('refreshTerms'),
    deleteTerm: document.getElementById('deleteTerm'),
    duplicateTerm: document.getElementById('duplicateTerm'),
    renameTerm: document.getElementById('renameTerm'),
    renameTermInput: document.getElementById('renameTermInput'),
    exportSelectedTerm: document.getElementById('exportSelectedTerm'),
    termSummary: document.getElementById('termSummary'),
    snapshotSelect: document.getElementById('snapshotSelect'),
    snapshotSummary: document.getElementById('snapshotSummary'),
    rollbackSnapshot: document.getElementById('rollbackSnapshot'),
    trashTerms: document.getElementById('trashTerms'),
    restoreTerm: document.getElementById('restoreTerm'),
    purgeTerm: document.getElementById('purgeTerm'),
    trashSummary: document.getElementById('trashSummary'),
    historyList: document.getElementById('historyList')
  };

  const state = { filesParsed: [], items: [], sessions: [], trash: [], history: [], snapshots: [], storage: 'unknown' };
  const clean = (v) => String(v || '').replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();
  const normalizeTerm = (v) => clean(v).toLowerCase();

  const setStatus = (msg, isError) => {
    els.status.textContent = msg;
    els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
  };

  const setParseProgress = (current, total, label) => {
    const safeTotal = Math.max(total || 1, 1);
    const pct = Math.round((current / safeTotal) * 100);
    els.parseProgressBar.style.width = `${pct}%`;
    els.parseProgressText.textContent = label || `${current}/${total}`;
  };

  const apiJson = async (url, options) => {
    const res = await fetch(url, options);
    const raw = await res.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch (e) {}
    if (!res.ok) {
      const serverMsg = (json && (json.error || json.message)) ? (json.error || json.message) : (raw || 'Request failed');
      throw new Error(`HTTP ${res.status}: ${serverMsg}`);
    }
    return json || {};
  };

  const ensureAdminContext = () => {
    const password = clean(els.password.value);
    if (!password) {
      setStatus('Введіть ADMIN_PASSWORD', true);
      return null;
    }
    return { password, actor: clean(els.actor.value) || 'admin-ui' };
  };

  const validateFiles = (files) => {
    if (!files.length) return 'Оберіть хоча б один .docx файл';
    if (files.length > MAX_FILES) return `Забагато файлів: максимум ${MAX_FILES}`;
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalBytes > MAX_TOTAL_BYTES) return `Занадто великий пакет: максимум ${(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB`;
    return '';
  };

  const extractTeacherNames = (value) => {
    const raw = clean(value);
    if (!raw) return [];
    return Array.from(new Set(raw.replace(/\s*(,|\/|\|)\s*/g, '; ').replace(/\s+та\s+/giu, '; ').split(';').map(clean).filter(Boolean)));
  };

  const parseGroups = (heading) => {
    const raw = clean(heading);
    const out = [];
    const re = /(\d{1,3})\s*([\p{L}])?/gu;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const g = clean(`${m[1]}${m[2] || ''}`.toLowerCase());
      if (g && !out.includes(g)) out.push(g);
    }
    return out;
  };

  const getElementText = (el) => {
    const nodes = el.getElementsByTagNameNS(WORD_NS, 't');
    let text = '';
    for (let i = 0; i < nodes.length; i++) text += nodes[i].textContent || '';
    return clean(text);
  };

  const parseDocxFile = async (file) => {
    const zip = await window.JSZip.loadAsync(file);
    const xmlStr = await zip.file('word/document.xml').async('string');
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlStr, 'application/xml');
    const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
    if (!body) return [];

    const items = [];
    let paragraphBuffer = [];
    let tableIdx = 0;

    for (let i = 0; i < body.childNodes.length; i++) {
      const child = body.childNodes[i];
      if (!child || !child.localName) continue;
      if (child.localName === 'p') {
        const text = getElementText(child);
        if (text) paragraphBuffer.push(text);
        continue;
      }
      if (child.localName !== 'tbl') continue;

      tableIdx += 1;
      const heading = paragraphBuffer[0] || '';
      paragraphBuffer = [];
      const groups = parseGroups(heading);

      const rows = child.getElementsByTagNameNS(WORD_NS, 'tr');
      let controlType = '';
      for (let r = 0; r < rows.length; r++) {
        if (r === 0) continue;
        const cells = rows[r].getElementsByTagNameNS(WORD_NS, 'tc');
        if (!cells.length) continue;
        const vals = [];
        for (let c = 0; c < cells.length; c++) vals.push(getElementText(cells[c]));
        while (vals.length < 7) vals.push('');
        const nonEmpty = vals.filter(Boolean);
        if (nonEmpty.length === 1 && vals[1]) { controlType = vals[1]; continue; }
        if (!vals[1]) continue;

        items.push({
          groupHeading: heading,
          groups,
          speciality: '',
          program: '',
          controlType,
          discipline: vals[1],
          examForm: vals[2],
          teacher: extractTeacherNames(vals[3]).join('; '),
          date: vals[4],
          time: vals[5],
          room: vals[6],
          sourceTable: tableIdx,
          sourceFile: file.name
        });
      }
    }
    return items;
  };

  const renderSummary = () => {
    els.fileCount.textContent = String(state.filesParsed.length);
    els.itemCount.textContent = String(state.items.length);
    els.groupPreview.innerHTML = '';
    const groups = Array.from(new Set(state.items.flatMap((i) => i.groups || []))).sort((a, b) => a.localeCompare(b, 'uk'));
    groups.slice(0, 60).forEach((g) => {
      const chip = document.createElement('span');
      chip.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800';
      chip.textContent = g;
      els.groupPreview.appendChild(chip);
    });
  };

  const renderTerms = () => {
    els.existingTerms.innerHTML = '';
    if (!state.sessions.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Немає активних сесій';
      els.existingTerms.appendChild(opt);
    } else {
      state.sessions.slice().sort((a, b) => normalizeTerm(a.term).localeCompare(normalizeTerm(b.term), 'uk')).forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.term || '';
        opt.textContent = `${s.term || 'Session'} (${(s.items || []).length} записів)`;
        els.existingTerms.appendChild(opt);
      });
    }

    els.trashTerms.innerHTML = '';
    if (!state.trash.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Корзина порожня';
      els.trashTerms.appendChild(opt);
    } else {
      state.trash.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.term || '';
        opt.textContent = `${s.term || 'Session'} (${(s.items || []).length})`;
        els.trashTerms.appendChild(opt);
      });
    }

    const totalActiveItems = state.sessions.reduce((sum, s) => sum + ((s.items || []).length), 0);
    const totalTrashItems = state.trash.reduce((sum, s) => sum + ((s.items || []).length), 0);
    els.termSummary.textContent = `Активних сесій: ${state.sessions.length} · Записів: ${totalActiveItems} · storage: ${state.storage}`;
    els.trashSummary.textContent = `У корзині: ${state.trash.length} сесій · ${totalTrashItems} записів`;
  };

  const renderSnapshots = () => {
    els.snapshotSelect.innerHTML = '';
    if (!state.snapshots.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Немає версій';
      els.snapshotSelect.appendChild(opt);
      els.snapshotSummary.textContent = 'Доступних версій: 0';
      return;
    }
    state.snapshots.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id || '';
      opt.textContent = `${new Date(s.at).toLocaleString('uk-UA')} · ${s.reason || 'update'} · ${s.by || 'unknown'}`;
      els.snapshotSelect.appendChild(opt);
    });
    els.snapshotSummary.textContent = `Доступних версій: ${state.snapshots.length}`;
  };

  const renderHistory = () => {
    els.historyList.innerHTML = '';
    const list = Array.isArray(state.history) ? state.history.slice().reverse().slice(0, 80) : [];
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'Історія поки порожня';
      els.historyList.appendChild(li);
      return;
    }
    list.forEach((entry) => {
      const li = document.createElement('li');
      const at = entry.at ? new Date(entry.at).toLocaleString('uk-UA') : '—';
      li.textContent = `${at} · ${clean(entry.action || 'action')} · ${clean(entry.term || '')} · ${clean(entry.by || 'unknown')}`;
      els.historyList.appendChild(li);
    });
  };

  const loadStore = async () => {
    const data = await apiJson('/api/session');
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.trash = Array.isArray(data.trash) ? data.trash : [];
    state.history = Array.isArray(data.history) ? data.history : [];
    state.snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    state.storage = data.storage || 'unknown';
    renderTerms();
    renderSnapshots();
    renderHistory();
    return data;
  };

  const exportJsonToFile = (payload, prefix) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const parseAll = async () => {
    const files = Array.from(els.files.files || []);
    const validationError = validateFiles(files);
    if (validationError) return setStatus(validationError, true);
    if (!window.JSZip) return setStatus('JSZip не завантажений', true);

    state.filesParsed = files.map((f) => f.name);
    state.items = [];
    setStatus('Парсинг файлів...');
    setParseProgress(0, files.length, `0/${files.length}`);

    for (let i = 0; i < files.length; i++) {
      try {
        const rows = await parseDocxFile(files[i]);
        state.items.push(...rows);
        setParseProgress(i + 1, files.length, `Готово: ${i + 1}/${files.length}`);
      } catch (e) {
        return setStatus(`Помилка парсингу ${files[i].name}: ${e.message}`, true);
      }
    }
    renderSummary();
    setStatus(`Парсинг завершено: ${state.items.length} записів`);
  };

  const uploadData = async () => {
    if (!state.items.length) return setStatus('Спочатку розпарсіть файли', true);
    const auth = ensureAdminContext();
    if (!auth) return;

    setStatus('Завантажую дані в API...');
    try {
      const safe = await apiJson('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: auth.password,
          actor: auth.actor,
          data: {
            sourceFile: state.filesParsed.join(', '),
            generatedAt: new Date().toISOString(),
            term: clean(els.term.value) || 'Session',
            studyForm: clean(els.studyForm.value) || '',
            items: state.items
          }
        })
      });
      setStatus(`Успішно: додано ${safe.added || 0}, всього ${safe.count || 0}`);
      await loadStore();
    } catch (e) {
      setStatus(`Помилка завантаження: ${e.message}`, true);
    }
  };

  const sendTermAction = async (action, extra = {}) => {
    const auth = ensureAdminContext();
    if (!auth) return null;
    return apiJson('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: auth.password, actor: auth.actor, action, ...extra })
    });
  };

  const deleteSelectedTerm = async () => {
    const term = clean(els.existingTerms.value || els.term.value);
    if (!term) return setStatus('Оберіть сесію для видалення', true);
    if (!window.confirm(`Перемістити сесію "${term}" у кошик?`)) return;
    try { await sendTermAction('deleteTerm', { term }); setStatus(`Сесію переміщено в кошик: ${term}`); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const restoreSelectedTerm = async () => {
    const term = clean(els.trashTerms.value);
    if (!term) return setStatus('Оберіть сесію в кошику', true);
    try { await sendTermAction('restoreTerm', { term }); setStatus(`Сесію відновлено: ${term}`); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const purgeSelectedTerm = async () => {
    const term = clean(els.trashTerms.value);
    if (!term) return setStatus('Оберіть сесію в кошику', true);
    if (!window.confirm(`Видалити назавжди "${term}"?`)) return;
    try { await sendTermAction('purgeTerm', { term }); setStatus(`Сесію видалено назавжди: ${term}`); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const renameSelectedTerm = async () => {
    const term = clean(els.existingTerms.value || els.term.value);
    const toTerm = clean(els.renameTermInput.value);
    if (!term || !toTerm) return setStatus('Оберіть сесію і введіть нову назву', true);
    try { await sendTermAction('renameTerm', { term, toTerm }); setStatus(`Перейменовано: ${term} → ${toTerm}`); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const duplicateSelectedTerm = async () => {
    const term = clean(els.existingTerms.value || els.term.value);
    const toTerm = clean(els.renameTermInput.value);
    if (!term || !toTerm) return setStatus('Оберіть сесію і введіть назву копії', true);
    try { await sendTermAction('duplicateTerm', { term, toTerm }); setStatus(`Дубль створено: ${term} → ${toTerm}`); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const rollbackToSnapshot = async () => {
    const snapshotId = clean(els.snapshotSelect.value);
    if (!snapshotId) return setStatus('Оберіть версію для відкату', true);
    if (!window.confirm('Відкотити базу сесій до обраної версії?')) return;
    try { await sendTermAction('rollbackSnapshot', { snapshotId }); setStatus('Відкат виконано'); await loadStore(); } catch (e) { setStatus(e.message, true); }
  };

  const exportBackup = async () => {
    try {
      const data = await loadStore();
      exportJsonToFile(data, 'session_backup_all');
      setStatus('JSON backup експортовано');
    } catch (e) {
      setStatus(`Помилка backup: ${e.message}`, true);
    }
  };

  const exportSelectedTerm = async () => {
    const term = clean(els.existingTerms.value || els.term.value);
    if (!term) return setStatus('Оберіть сесію для експорту', true);
    const data = await loadStore();
    const sessions = (data.sessions || []).filter((s) => normalizeTerm(s.term) === normalizeTerm(term));
    exportJsonToFile({ sessions, exportedAt: new Date().toISOString(), term }, 'session_backup_term');
    setStatus(`Експортовано сесію: ${term}`);
  };

  els.parseBtn.addEventListener('click', parseAll);
  els.uploadBtn.addEventListener('click', uploadData);
  els.exportBackup.addEventListener('click', exportBackup);
  els.exportSelectedTerm.addEventListener('click', exportSelectedTerm);
  els.refreshTerms.addEventListener('click', () => loadStore().catch((e) => setStatus(e.message, true)));
  els.renameTerm.addEventListener('click', renameSelectedTerm);
  els.duplicateTerm.addEventListener('click', duplicateSelectedTerm);
  els.deleteTerm.addEventListener('click', deleteSelectedTerm);
  els.restoreTerm.addEventListener('click', restoreSelectedTerm);
  els.purgeTerm.addEventListener('click', purgeSelectedTerm);
  els.rollbackSnapshot.addEventListener('click', rollbackToSnapshot);

  setParseProgress(0, 1, 'Очікування файлів...');
  loadStore().catch((e) => setStatus(`Помилка ініціалізації: ${e.message}`, true));
})();
