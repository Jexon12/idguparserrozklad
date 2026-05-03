(function () {
  const API_PROXY = '/api/';
  const API_SESSION = '/api/session';
  const VUZ_ID = 11927;
  const CONTROL_OPTIONS = ['залік', 'іспит', 'захист', 'диф.залік'];
  const CONTROL_COLORS = {
    'залік': { bg: '#ecfdf5', border: '#34d399' },
    'іспит': { bg: '#eff6ff', border: '#60a5fa' },
    'захист': { bg: '#fffbeb', border: '#fbbf24' },
    'диф.залік': { bg: '#f5f3ff', border: '#a78bfa' }
  };
  const DRAFT_KEY = 'session_constructor_draft_v1';

  const els = {
    adminPassword: document.getElementById('adminPassword'),
    adminActor: document.getElementById('adminActor'),
    sessionTermSelect: document.getElementById('sessionTermSelect'),
    sessionTerm: document.getElementById('sessionTerm'),
    modeBasicBtn: document.getElementById('modeBasicBtn'),
    modeProBtn: document.getElementById('modeProBtn'),
    studyForm: document.getElementById('studyForm'),
    docxFiles: document.getElementById('docxFiles'),
    facultySelect: document.getElementById('facultySelect'),
    semesterPreset: document.getElementById('semesterPreset'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    presetWinterBtn: document.getElementById('presetWinterBtn'),
    presetSummerBtn: document.getElementById('presetSummerBtn'),
    presetThisMonthBtn: document.getElementById('presetThisMonthBtn'),
    presetNext7Btn: document.getElementById('presetNext7Btn'),
    draftInfo: document.getElementById('draftInfo'),
    coursesBox: document.getElementById('coursesBox'),
    groupsBox: document.getElementById('groupsBox'),
    selectAllCourses: document.getElementById('selectAllCourses'),
    clearCourses: document.getElementById('clearCourses'),
    selectAllGroups: document.getElementById('selectAllGroups'),
    clearGroups: document.getElementById('clearGroups'),
    parseBtn: document.getElementById('parseBtn'),
    normalizeBtn: document.getElementById('normalizeBtn'),
    addRowBtn: document.getElementById('addRowBtn'),
    uploadBtn: document.getElementById('uploadBtn'),
    excelBtn: document.getElementById('excelBtn'),
    wordBtn: document.getElementById('wordBtn'),
    copyBtn: document.getElementById('copyBtn'),
    searchInput: document.getElementById('searchInput'),
    groupFilter: document.getElementById('groupFilter'),
    teacherFilter: document.getElementById('teacherFilter'),
    zalikStartDate: document.getElementById('zalikStartDate'),
    zalikEndDate: document.getElementById('zalikEndDate'),
    examStartDate: document.getElementById('examStartDate'),
    examEndDate: document.getElementById('examEndDate'),
    autoPlanBtn: document.getElementById('autoPlanBtn'),
    conflictsBtn: document.getElementById('conflictsBtn'),
    suggestionsBtn: document.getElementById('suggestionsBtn'),
    suggestionsBox: document.getElementById('suggestionsBox'),
    conflictSummary: document.getElementById('conflictSummary'),
    countLabel: document.getElementById('countLabel'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    status: document.getElementById('status'),
    errorBox: document.getElementById('errorBox'),
    tableBody: document.getElementById('tableBody'),
    selectAllRows: document.getElementById('selectAllRows'),
    bulkControlType: document.getElementById('bulkControlType'),
    bulkDate: document.getElementById('bulkDate'),
    bulkTime: document.getElementById('bulkTime'),
    bulkRoom: document.getElementById('bulkRoom'),
    applyBulkBtn: document.getElementById('applyBulkBtn'),
    proPanel: document.getElementById('proPanel'),
    saveSessionBtn: document.getElementById('saveSessionBtn'),
    loadSessionBtn: document.getElementById('loadSessionBtn'),
    loadSessionFile: document.getElementById('loadSessionFile'),
    loadApiBtn: document.getElementById('loadApiBtn'),
    shiftMinusBtn: document.getElementById('shiftMinusBtn'),
    shiftPlusBtn: document.getElementById('shiftPlusBtn'),
    filterConflictsBtn: document.getElementById('filterConflictsBtn'),
    filterMissingBtn: document.getElementById('filterMissingBtn')
  };

  const state = {
    faculties: [],
    courses: [],
    groups: [],
    rows: [],
    filteredRows: [],
    conflictIndices: new Set(),
    selectedRowKeys: new Set(),
    mode: 'basic',
    quality: { missingDate: 0, missingTime: 0, missingRoom: 0, missingTeacher: 0, teacherAliases: 0, duplicateRows: 0 },
    renderLimit: 200,
    sortField: null,
    sortAsc: true,
    undoStack: [],
    redoStack: [],
    maxUndo: 30,
    filterConflictsOnly: false,
    filterMissingOnly: false,
    overloadIndices: new Set()
  };
  let conflictsWorker = null;

  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeDiscipline = (v) => clean(v).replace(/^[\d\.\-\)\(]+\s*/g, '').replace(/[;:,]+$/g, '').trim();
  const splitTeachers = (v) => Array.from(new Set(clean(v).replace(/\s*(,|\/|\|)\s*/g, '; ').replace(/\s+та\s+/giu, '; ').split(';').map(clean).filter(Boolean)));
  const rowKey = (r) => `${clean(r.discipline)}__${clean(r.group)}`;

  function showError(msg) {
    if (!msg) {
      els.errorBox.classList.add('hidden');
      els.errorBox.textContent = '';
      return;
    }
    els.errorBox.textContent = msg;
    els.errorBox.classList.remove('hidden');
  }
  function setStatus(msg, isErr) {
    els.status.textContent = msg || '';
    els.status.className = isErr ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
  }
  function setProgress(current, total, label) {
    const t = Math.max(total || 1, 1);
    els.progressBar.style.width = `${Math.round((current / t) * 100)}%`;
    els.progressText.textContent = label || `${current}/${total}`;
  }

  function renderSelect(el, items, placeholder) {
    el.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach((it) => {
      const o = document.createElement('option');
      o.value = String(it.Key || it.key || '');
      o.textContent = String(it.Value || it.value || '');
      el.appendChild(o);
    });
  }
  function resolveSessionTerm() {
    const typed = clean(els.sessionTerm.value);
    if (typed) return typed;
    const selected = clean(els.sessionTermSelect?.value);
    return selected || 'Session';
  }
  function renderCheckboxes(container, items, kind) {
    container.innerHTML = '';
    items.forEach((it, idx) => {
      const key = String(it.Key || it.key || '');
      const val = String(it.Value || it.value || '');
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm';
      row.innerHTML = `<input type="checkbox" data-kind="${kind}" value="${key}" checked><span>${val}</span>`;
      row.querySelector('input').id = `${kind}_${idx}_${key}`;
      container.appendChild(row);
    });
  }
  const getChecked = (kind) => Array.from(document.querySelectorAll(`input[type="checkbox"][data-kind="${kind}"]:checked`)).map((x) => x.value).filter(Boolean);
  const setChecked = (kind, flag) => document.querySelectorAll(`input[type="checkbox"][data-kind="${kind}"]`).forEach((x) => { x.checked = flag; });

  function toApiDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    if (!y || !m || !d) return '';
    return `${d}.${m}.${y}`;
  }
  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function applySemesterPreset(preset) {
    const now = new Date();
    const year = now.getFullYear();
    if (preset === 'autumn') {
      els.startDate.value = isoLocal(new Date(year, 8, 1));
      els.endDate.value = isoLocal(new Date(year, 11, 31));
      return;
    }
    if (preset === 'spring') {
      els.startDate.value = isoLocal(new Date(year, 1, 1));
      els.endDate.value = isoLocal(new Date(year, 5, 30));
      return;
    }
    els.startDate.value = isoLocal(new Date(year, now.getMonth(), 1));
    els.endDate.value = isoLocal(new Date(year, now.getMonth() + 1, 0));
  }

  async function fetchApi(action, params = {}) {
    const url = new URL(API_PROXY + action, window.location.origin);
    url.searchParams.append('aVuzID', VUZ_ID);
    if (action === 'GetStudyGroups') url.searchParams.append('aGiveStudyTimes', 'false');
    else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') url.searchParams.append('aGiveStudyTimes', 'true');
    url.searchParams.append('_', Date.now());
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') url.searchParams.append(k, '');
      else if (typeof v === 'string' && !v.startsWith('"')) url.searchParams.append(k, `"${v}"`);
      else url.searchParams.append(k, v);
    });
    const res = await fetch(url);
    const text = await res.text();
    const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
    const json = jsonpMatch ? JSON.parse(jsonpMatch[1]) : JSON.parse(text);
    return json.d || json;
  }

  function dedupeRows(rows) {
    const map = new Map();
    rows.forEach((r) => {
      const d = normalizeDiscipline(r.discipline);
      const g = clean(r.group);
      if (!d || !g) return;
      const key = `${d}__${g}`;
      if (!map.has(key)) map.set(key, { discipline: d, group: g, teachers: new Set(), controlType: clean(r.controlType || 'залік'), date: clean(r.date || ''), time: clean(r.time || ''), room: clean(r.room || '') });
      splitTeachers((r.teachers || []).join('; ')).forEach((t) => map.get(key).teachers.add(t));
      if (!map.get(key).date && r.date) map.get(key).date = clean(r.date);
      if (!map.get(key).time && r.time) map.get(key).time = clean(r.time);
      if (!map.get(key).room && r.room) map.get(key).room = clean(r.room);
    });
    return Array.from(map.values()).map((x) => ({
      discipline: x.discipline,
      group: x.group,
      teachers: Array.from(x.teachers).sort((a, b) => a.localeCompare(b, 'uk')),
      controlType: CONTROL_OPTIONS.includes(x.controlType) ? x.controlType : 'залік',
      date: x.date || '',
      time: x.time || '',
      room: x.room || ''
    }));
  }

  function renderFilters(rows) {
    const uniqueGroupsMap = new Map();
    rows.forEach(r => {
      if (!r.group) return;
      const key = r.group.toUpperCase();
      if (!uniqueGroupsMap.has(key)) uniqueGroupsMap.set(key, r.group.toUpperCase()); // Convert everything to uppercase for consistency
    });
    const groups = Array.from(uniqueGroupsMap.values()).sort((a, b) => a.localeCompare(b, 'uk'));
    
    const teachers = Array.from(new Set(rows.flatMap((r) => r.teachers).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    const rooms = Array.from(new Set(rows.map((r) => r.room).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    els.groupFilter.innerHTML = '<option value="">Усі групи</option>';
    groups.forEach((g) => { const o = document.createElement('option'); o.value = g; o.textContent = g; els.groupFilter.appendChild(o); });
    els.teacherFilter.innerHTML = '<option value="">Усі викладачі</option>';
    teachers.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; els.teacherFilter.appendChild(o); });
    // Update datalists for autocomplete
    updateDatalist('dl-groups', groups);
    updateDatalist('dl-teachers', teachers);
    updateDatalist('dl-rooms', rooms);
  }
  function updateDatalist(id, items) {
    let dl = document.getElementById(id);
    if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
    dl.innerHTML = items.map((v) => `<option value="${v.replace(/"/g, '&quot;')}">`).join('');
  }
  async function loadSessionTerms() {
    if (!els.sessionTermSelect) return;
    els.sessionTermSelect.innerHTML = '<option value="">Завантаження сесій...</option>';
    try {
      const res = await fetch('/api/session');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const terms = Array.from(new Set((data.sessions || []).map((s) => clean(s.term)).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
      els.sessionTermSelect.innerHTML = '';
      const first = document.createElement('option');
      first.value = '';
      first.textContent = terms.length ? 'Оберіть наявну сесію...' : 'Немає сесій (введіть нову назву)';
      els.sessionTermSelect.appendChild(first);
      terms.forEach((term) => {
        const opt = document.createElement('option');
        opt.value = term;
        opt.textContent = term;
        els.sessionTermSelect.appendChild(opt);
      });
    } catch (e) {
      els.sessionTermSelect.innerHTML = '<option value="">Не вдалося завантажити список сесій</option>';
    }
  }

  function renderTable(rows) {
    els.tableBody.innerHTML = '';
    const visibleRows = rows.slice(0, state.renderLimit);
    visibleRows.forEach((r, i) => {
      const tr = document.createElement('tr');
      const currentControl = CONTROL_OPTIONS.includes(clean(r.controlType).toLowerCase()) ? clean(r.controlType).toLowerCase() : 'залік';
      const key = rowKey(r);
      const checked = state.selectedRowKeys.has(key) ? 'checked' : '';
      const colors = CONTROL_COLORS[currentControl] || CONTROL_COLORS['залік'];
      tr.draggable = true;
      tr.dataset.dragIndex = i;
      tr.innerHTML = `
        <td class="px-2 py-2"><input type="checkbox" data-act="select-row" data-i="${i}" ${checked}></td>
        <td class="px-2 py-2">${i + 1}</td>
        <td class="px-2 py-2"><input data-f="discipline" data-i="${i}" list="dl-disciplines" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.discipline || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="group" data-i="${i}" list="dl-groups" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.group || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="teachers" data-i="${i}" list="dl-teachers" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.teachers || []).join('; ').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><select data-f="controlType" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700">${CONTROL_OPTIONS.map((o) => `<option value="${o}" ${currentControl === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td class="px-2 py-2"><input data-f="date" data-i="${i}" type="date" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.date || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="time" data-i="${i}" type="time" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.time || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="room" data-i="${i}" list="dl-rooms" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.room || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><button data-act="del" data-i="${i}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити</button></td>
      `;
      if (state.conflictIndices.has(i)) {
        tr.style.backgroundColor = '#fef2f2';
        tr.style.borderLeft = '4px solid #ef4444';
      } else if (state.overloadIndices && state.overloadIndices.has(i)) {
        tr.style.backgroundColor = '#fefce8';
        tr.style.borderLeft = '4px solid #facc15';
        tr.title = 'Попередження: викладач має більше 2-х іспитів/заліків у цей день!';
      } else {
        tr.style.backgroundColor = colors.bg;
        tr.style.borderLeft = '4px solid ' + colors.border;
      }
      els.tableBody.appendChild(tr);
    });
    els.countLabel.textContent = String(rows.length);
    if (els.renderInfo) {
      if (rows.length > state.renderLimit) els.renderInfo.textContent = `Показано ${state.renderLimit} з ${rows.length} (для швидкості)`;
      else els.renderInfo.textContent = `Показано всі ${rows.length}`;
    }
    els.uploadBtn.disabled = false;
    els.uploadBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    // Update discipline datalist
    const disciplines = Array.from(new Set(state.rows.map((r) => r.discipline).filter(Boolean)));
    updateDatalist('dl-disciplines', disciplines);
    renderStatistics();
  }
  function renderQualityPanel() {
    if (!els.qualityPanel) return;
    const q = state.quality || {};
    const items = [
      ['Missing date', q.missingDate || 0],
      ['Missing time (exam)', q.missingTime || 0],
      ['Missing room (exam)', q.missingRoom || 0],
      ['Missing teacher', q.missingTeacher || 0],
      ['Teacher aliases', q.teacherAliases || 0],
      ['Duplicates', q.duplicateRows || 0]
    ];
    els.qualityPanel.innerHTML = items.map(([k, v]) => `<button data-q="${k}" class="text-left px-2 py-1 rounded bg-white dark:bg-gray-700 border dark:border-gray-600"><div class="text-[11px] text-gray-500">${k}</div><div class="font-bold">${v}</div></button>`).join('');
  }
  function setMode(mode) {
    state.mode = mode === 'pro' ? 'pro' : 'basic';
    const isPro = state.mode === 'pro';
    if (els.proPanel) els.proPanel.classList.toggle('hidden', !isPro);
    if (els.modeBasicBtn) {
      els.modeBasicBtn.classList.toggle('bg-violet-600', !isPro);
      els.modeBasicBtn.classList.toggle('text-white', !isPro);
    }
    if (els.modeProBtn) {
      els.modeProBtn.classList.toggle('bg-violet-600', isPro);
      els.modeProBtn.classList.toggle('text-white', isPro);
    }
    saveDraftDebounced();
  }

  function applyFilters() {
    const q = clean(els.searchInput.value).toLowerCase();
    const gf = clean(els.groupFilter.value);
    const tf = clean(els.teacherFilter.value);
    state.filteredRows = state.rows.filter((r, i) => {
      if (state.filterConflictsOnly && !state.conflictIndices.has(i)) return false;
      if (state.filterMissingOnly && (!r.date || (!r.time && r.controlType === 'іспит'))) return false;
      if (gf && r.group.toUpperCase() !== gf.toUpperCase()) return false;
      if (tf && !r.teachers.includes(tf)) return false;
      if (!q) return true;
      return `${r.discipline} ${r.group} ${r.teachers.join(' ')} ${r.controlType} ${r.date || ''} ${r.time || ''}`.toLowerCase().includes(q);
    });
    if (state.sortField) applySorting();
    detectConflicts(false);
    renderTable(state.filteredRows);
  }

  function applySorting() {
    const f = state.sortField;
    if (!f) return;
    const dir = state.sortAsc ? 1 : -1;
    state.filteredRows.sort((a, b) => {
      let va = '', vb = '';
      if (f === 'discipline') { va = a.discipline; vb = b.discipline; }
      else if (f === 'group') { va = a.group; vb = b.group; }
      else if (f === 'teachers') { va = (a.teachers || []).join('; '); vb = (b.teachers || []).join('; '); }
      else if (f === 'controlType') { va = a.controlType; vb = b.controlType; }
      else if (f === 'date') { va = a.date || ''; vb = b.date || ''; }
      else if (f === 'time') { va = a.time || ''; vb = b.time || ''; }
      else if (f === 'room') { va = a.room || ''; vb = b.room || ''; }
      return va.localeCompare(vb, 'uk') * dir;
    });
  }

  function toggleSort(field) {
    syncFromGrid();
    if (state.sortField === field) state.sortAsc = !state.sortAsc;
    else { state.sortField = field; state.sortAsc = true; }
    applyFilters();
    updateSortIndicators();
  }

  function updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      if (th.dataset.sort === state.sortField) arrow.textContent = state.sortAsc ? ' ▲' : ' ▼';
      else arrow.textContent = '';
    });
  }

  // --- Undo / Redo ---
  function pushUndo() {
    state.undoStack.push(JSON.stringify(state.rows));
    if (state.undoStack.length > state.maxUndo) state.undoStack.shift();
    state.redoStack = [];
  }
  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(JSON.stringify(state.rows));
    state.rows = JSON.parse(state.undoStack.pop());
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
    setStatus('Скасовано (Undo)');
  }
  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(JSON.stringify(state.rows));
    state.rows = JSON.parse(state.redoStack.pop());
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
    setStatus('Повернуто (Redo)');
  }

  // --- Statistics ---
  function renderStatistics() {
    const el = document.getElementById('statsPanel');
    if (!el) return;
    const rows = state.filteredRows;
    const byType = {};
    CONTROL_OPTIONS.forEach((t) => { byType[t] = 0; });
    const byDate = {};
    rows.forEach((r) => {
      const ct = clean(r.controlType).toLowerCase();
      if (byType[ct] !== undefined) byType[ct]++;
      else byType['залік']++;
      if (r.date) { byDate[r.date] = (byDate[r.date] || 0) + 1; }
    });
    const maxPerDay = Math.max(0, ...Object.values(byDate));
    const busiestDay = Object.entries(byDate).find(([, v]) => v === maxPerDay)?.[0] || '—';
    const teacherLoad = {};
    rows.forEach((r) => (r.teachers || []).forEach((t) => { teacherLoad[t] = (teacherLoad[t] || 0) + 1; }));
    const busiestTeacher = Object.entries(teacherLoad).sort((a, b) => b[1] - a[1])[0];
    const colorDot = (type) => `<span class="w-2 h-2 rounded-full inline-block" style="background:${{'залік':'#34d399','іспит':'#60a5fa','захист':'#fbbf24','диф.залік':'#a78bfa'}[type] || '#ccc'}"></span>`;
    el.innerHTML = `<div class="flex gap-4 flex-wrap items-center text-xs">
      ${CONTROL_OPTIONS.map((t) => `<span class="flex items-center gap-1">${colorDot(t)} ${t}: <b>${byType[t]}</b></span>`).join('')}
      <span>| Найбільше/день: <b>${maxPerDay}</b> (${busiestDay})</span>
      ${busiestTeacher ? `<span>| Найзайнятіший: <b>${busiestTeacher[0].split(' ').slice(0,2).join(' ')}</b> (${busiestTeacher[1]})</span>` : ''}
    </div>`;
  }

  // --- Auto-detect control type ---
  function autoDetectControlType(discipline) {
    const d = discipline.toLowerCase();
    if (/курсов|курсова/i.test(d)) return 'захист';
    if (/практик|стажуванн/i.test(d)) return 'диф.залік';
    if (/іспит|екзамен/i.test(d)) return 'іспит';
    if (/диф[\s.]*залік|диференц/i.test(d)) return 'диф.залік';
    return null; // no auto-detect
  }

  function syncFromGrid() {
    const list = state.filteredRows.slice();
    list.forEach((r, i) => {
      const d = document.querySelector(`input[data-f="discipline"][data-i="${i}"]`);
      const g = document.querySelector(`input[data-f="group"][data-i="${i}"]`);
      const t = document.querySelector(`input[data-f="teachers"][data-i="${i}"]`);
      const c = document.querySelector(`select[data-f="controlType"][data-i="${i}"]`);
      const dt = document.querySelector(`input[data-f="date"][data-i="${i}"]`);
      const tm = document.querySelector(`input[data-f="time"][data-i="${i}"]`);
      const rm = document.querySelector(`input[data-f="room"][data-i="${i}"]`);
      if (d) r.discipline = normalizeDiscipline(d.value);
      if (g) r.group = clean(g.value);
      if (t) r.teachers = splitTeachers(t.value);
      if (c) r.controlType = clean(c.value || 'залік');
      if (dt) r.date = clean(dt.value);
      if (tm) r.time = clean(tm.value);
      // time is now allowed for all control types
      if (rm) r.room = clean(rm.value);

      const rowChecked = document.querySelector(`input[data-act="select-row"][data-i="${i}"]`);
      const key = rowKey(r);
      if (rowChecked?.checked) state.selectedRowKeys.add(key);
      else state.selectedRowKeys.delete(key);
    });
    state.filteredRows = list;
  }

  function mergeFilteredBack() {
    const old = new Set(state.filteredRows.map((r) => `${r.discipline}__${r.group}`));
    const rest = state.rows.filter((r) => !old.has(`${r.discipline}__${r.group}`));
    state.rows = dedupeRows(rest.concat(state.filteredRows));
  }
  function applyDatePreset(preset) {
    const now = new Date();
    const year = now.getFullYear();
    if (preset === 'winter') {
      els.zalikStartDate.value = `${year}-12-10`;
      els.zalikEndDate.value = `${year}-12-24`;
      els.examStartDate.value = `${year + 1}-01-10`;
      els.examEndDate.value = `${year + 1}-01-31`;
    } else if (preset === 'summer') {
      els.zalikStartDate.value = `${year}-05-20`;
      els.zalikEndDate.value = `${year}-06-10`;
      els.examStartDate.value = `${year}-06-11`;
      els.examEndDate.value = `${year}-06-30`;
    } else if (preset === 'month') {
      const s = new Date(year, now.getMonth(), 1);
      const e = new Date(year, now.getMonth() + 1, 0);
      els.startDate.value = isoLocal(s);
      els.endDate.value = isoLocal(e);
    } else if (preset === 'next7') {
      const s = new Date();
      const e = new Date();
      e.setDate(e.getDate() + 7);
      els.startDate.value = isoLocal(s);
      els.endDate.value = isoLocal(e);
    }
    saveDraftDebounced();
  }

  function datesBetween(startIso, endIso) {
    if (!startIso || !endIso) return [];
    const s = new Date(startIso + 'T00:00:00');
    const e = new Date(endIso + 'T00:00:00');
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return [];
    const out = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(isoLocal(d));
    return out;
  }

  function autoPlanDates() {
    syncFromGrid();
    const zDates = datesBetween(els.zalikStartDate.value, els.zalikEndDate.value);
    const eDates = datesBetween(els.examStartDate.value, els.examEndDate.value);
    if (!zDates.length && !eDates.length) return showError('Вкажіть діапазони дат для заліків та/або іспитів');
    let zi = 0;
    let ei = 0;
    state.filteredRows.forEach((r) => {
      const ctl = clean(r.controlType).toLowerCase();
      if (ctl === 'іспит') {
        if (eDates.length) r.date = eDates[ei++ % eDates.length];
      } else {
        if (zDates.length) r.date = zDates[zi++ % zDates.length];
      }
    });
    mergeFilteredBack();
    applyFilters();
    showError('');
    setStatus('Дати проставлено автоматично');
  }

  function detectConflicts(withStatus = true) {
    if (!conflictsWorker) {
      conflictsWorker = new Worker('/js/workers/session-conflicts-worker.js?v=20260503-6');
      conflictsWorker.onmessage = (evt) => {
        const data = evt.data || {};
        state.conflictIndices = new Set(data.conflictIndices || []);
        state.overloadIndices = new Set(data.overloadIndices || []);
        state.quality = data.quality || {};
        if (els.conflictSummary) els.conflictSummary.innerHTML = `Конфліктів: <b>${state.conflictIndices.size}</b>${state.overloadIndices.size ? ` | Перевантажень: <b class="text-amber-600">${state.overloadIndices.size}</b>` : ''}`;
        renderQualityPanel();
        renderTable(state.filteredRows);
      };
    }
    conflictsWorker.postMessage({ rows: state.filteredRows, mode: clean(els.conflictMode?.value || 'soft') });
    if (withStatus) setStatus('Перевірка конфліктів виконана');
  }

  function collectConflictIndices(rows) {
    const out = new Set();
    const byGroupSlot = new Map();
    const byTeacherSlot = new Map();
    const byRoomSlot = new Map();
    rows.forEach((r, idx) => {
      const date = clean(r.date);
      const time = clean(r.time);
      const isExam = clean(r.controlType).toLowerCase() === 'іспит';
      if (!isExam || !date || !time) return;
      const gk = `${clean(r.group).toLowerCase()}__${date}__${time}`;
      if (!byGroupSlot.has(gk)) byGroupSlot.set(gk, []);
      byGroupSlot.get(gk).push(idx);
      (r.teachers || []).forEach((t) => {
        const tk = `${clean(t).toLowerCase()}__${date}__${time}`;
        if (!byTeacherSlot.has(tk)) byTeacherSlot.set(tk, []);
        byTeacherSlot.get(tk).push(idx);
      });
      const room = clean(r.room).replace(/\s+/g, '').toLowerCase();
      if (room) {
        const rk = `${room}__${date}__${time}`;
        if (!byRoomSlot.has(rk)) byRoomSlot.set(rk, []);
        byRoomSlot.get(rk).push(idx);
      }
    });
    [byGroupSlot, byTeacherSlot, byRoomSlot].forEach((map) => map.forEach((arr) => { if (arr.length > 1) arr.forEach((i) => out.add(i)); }));
    return out;
  }

  function buildSuggestions() {
    syncFromGrid();
    const rows = state.filteredRows.slice();
    const conflictSet = collectConflictIndices(rows);
    if (!conflictSet.size) {
      els.suggestionsBox.classList.remove('hidden');
      els.suggestionsBox.textContent = 'Конфліктів не знайдено. Підказки не потрібні.';
      return;
    }
    const examDates = datesBetween(els.examStartDate.value, els.examEndDate.value);
    if (!examDates.length) {
      els.suggestionsBox.classList.remove('hidden');
      els.suggestionsBox.textContent = 'Для smart-підказок вкажіть діапазон дат іспитів.';
      return;
    }

    const currentConflicts = conflictSet.size;
    const suggestions = [];
    Array.from(conflictSet).slice(0, 30).forEach((idx) => {
      const item = rows[idx];
      if (clean(item.controlType).toLowerCase() !== 'іспит' || !clean(item.time)) return;
      let best = null;
      examDates.forEach((candidateDate) => {
        if (candidateDate === clean(item.date)) return;
        const clone = rows.map((x) => ({ ...x, teachers: Array.isArray(x.teachers) ? x.teachers.slice() : [] }));
        clone[idx].date = candidateDate;
        const nextConf = collectConflictIndices(clone).size;
        const improvement = currentConflicts - nextConf;
        if (improvement > 0 && (!best || improvement > best.improvement)) {
          best = { candidateDate, nextConf, improvement };
        }
      });
      if (best) {
        suggestions.push({
          idx,
          text: `Група ${item.group}: "${item.discipline}" (${(item.teachers || []).join(', ')}) — перенести з ${item.date || '—'} ${item.time || ''} на ${best.candidateDate} ${item.time}. Конфліктів стане менше на ${best.improvement}.`
        });
      }
    });

    els.suggestionsBox.classList.remove('hidden');
    if (!suggestions.length) {
      els.suggestionsBox.textContent = 'Автопокращень не знайдено в заданому діапазоні дат.';
      return;
    }
    els.suggestionsBox.innerHTML = `<div class="font-bold mb-2">Рекомендації:</div><ul class="list-disc pl-5">${suggestions.slice(0, 20).map((s) => `<li>${s.text}</li>`).join('')}</ul>`;
  }
  function applyBulkToSelected() {
    syncFromGrid();
    pushUndo();
    const ctl = clean(els.bulkControlType.value);
    const date = clean(els.bulkDate.value);
    const time = clean(els.bulkTime.value);
    const room = clean(els.bulkRoom.value);
    if (!state.selectedRowKeys.size) return showError('Оберіть рядки для пакетної дії');
    state.filteredRows.forEach((r) => {
      if (!state.selectedRowKeys.has(rowKey(r))) return;
      if (ctl) r.controlType = ctl;
      if (date) r.date = date;
      if (room) r.room = room;
      if (time) r.time = time;
    });
    mergeFilteredBack();
    applyFilters();
    saveDraftDebounced();
  }

  function shiftSelectedDates(days) {
    syncFromGrid();
    if (!state.selectedRowKeys.size) return showError('Оберіть рядки для зсуву дат');
    pushUndo();
    let shiftedCount = 0;
    state.filteredRows.forEach((r) => {
      if (!state.selectedRowKeys.has(rowKey(r)) || !r.date) return;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return;
      d.setDate(d.getDate() + days);
      r.date = d.toISOString().slice(0, 10);
      shiftedCount++;
    });
    mergeFilteredBack();
    applyFilters();
    saveDraftDebounced();
    setStatus(`Зміщено дат: ${shiftedCount}`);
  }
  function validateYearRanges() {
    const bad = [els.zalikStartDate.value, els.zalikEndDate.value, els.examStartDate.value, els.examEndDate.value, els.startDate.value, els.endDate.value]
      .filter(Boolean)
      .some((x) => {
        const y = Number(String(x).slice(0, 4));
        return y < 2025 || y > 2027;
      });
    if (bad) setStatus('Увага: перевірте роки в датах (очікувано 2025–2027)', true);
  }
  function getDraftPayload() {
    return {
      ts: new Date().toISOString(),
      mode: state.mode,
      fields: {
        sessionTerm: els.sessionTerm.value,
        sessionTermSelect: els.sessionTermSelect?.value || '',
        studyForm: els.studyForm.value,
        facultySelect: els.facultySelect.value,
        semesterPreset: els.semesterPreset.value,
        startDate: els.startDate.value,
        endDate: els.endDate.value,
        zalikStartDate: els.zalikStartDate.value,
        zalikEndDate: els.zalikEndDate.value,
        examStartDate: els.examStartDate.value,
        examEndDate: els.examEndDate.value
      },
      rows: state.rows
    };
  }
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(getDraftPayload()));
      if (els.draftInfo) els.draftInfo.textContent = `Чернетка збережена: ${new Date().toLocaleTimeString('uk-UA')}`;
    } catch (e) {}
  }
  let saveDraftTimer = null;
  function saveDraftDebounced() {
    clearTimeout(saveDraftTimer);
    saveDraftTimer = setTimeout(saveDraft, 250);
  }
  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const f = draft.fields || {};
      if (typeof f.sessionTerm === 'string') els.sessionTerm.value = f.sessionTerm;
      if (els.sessionTermSelect && typeof f.sessionTermSelect === 'string') els.sessionTermSelect.value = f.sessionTermSelect;
      if (typeof f.studyForm === 'string') els.studyForm.value = f.studyForm;
      if (typeof f.facultySelect === 'string') els.facultySelect.value = f.facultySelect;
      if (typeof f.semesterPreset === 'string') els.semesterPreset.value = f.semesterPreset;
      if (typeof f.startDate === 'string') els.startDate.value = f.startDate;
      if (typeof f.endDate === 'string') els.endDate.value = f.endDate;
      if (typeof f.zalikStartDate === 'string') els.zalikStartDate.value = f.zalikStartDate;
      if (typeof f.zalikEndDate === 'string') els.zalikEndDate.value = f.zalikEndDate;
      if (typeof f.examStartDate === 'string') els.examStartDate.value = f.examStartDate;
      if (typeof f.examEndDate === 'string') els.examEndDate.value = f.examEndDate;
      if (Array.isArray(draft.rows) && draft.rows.length) {
        state.rows = draft.rows.map((r) => ({ ...r, teachers: Array.isArray(r.teachers) ? r.teachers : splitTeachers(r.teachers || '') }));
        renderFilters(state.rows);
        applyFilters();
      }
      setMode(draft.mode || 'basic');
      if (els.draftInfo) els.draftInfo.textContent = `Чернетку відновлено (${new Date(draft.ts || Date.now()).toLocaleString('uk-UA')})`;
    } catch (e) {}
  }

  async function buildFromSchedule() {
    showError('');
    setStatus('Завантаження фільтрів...');
    setProgress(0, 1, 'Підготовка...');

    const selectedFaculty = clean(els.facultySelect.value);
    const selectedCourses = getChecked('course');
    const selectedGroups = getChecked('group');
    const startDate = toApiDate(els.startDate.value);
    const endDate = toApiDate(els.endDate.value);
    if (!selectedFaculty) throw new Error('Оберіть факультет');
    if (!selectedCourses.length) throw new Error('Оберіть хоча б один курс');
    if (!startDate || !endDate) throw new Error('Оберіть період дат');

    const filters = await fetchApi('GetStudentScheduleFiltersData');
    const forms = Array.isArray(filters?.educForms) ? filters.educForms : [];
    const isZaochna = clean(els.studyForm.value).toLowerCase().includes('заочн');
    const selectedForm = forms.find((x) => clean(x.Value).toLowerCase().includes(isZaochna ? 'заочн' : 'денн')) || forms[0];

    const groups = [];
    for (let i = 0; i < selectedCourses.length; i++) {
      setProgress(i, selectedCourses.length, `Групи: ${i}/${selectedCourses.length}`);
      const res = await fetchApi('GetStudyGroups', { aFacultyID: selectedFaculty, aEducationForm: selectedForm?.Key || '', aCourse: selectedCourses[i] });
      (res?.studyGroups || []).forEach((g) => groups.push({ key: String(g.Key), value: clean(g.Value) }));
    }
    state.groups = Array.from(new Map(groups.map((g) => [g.key, g])).values()).filter((g) => !selectedGroups.length || selectedGroups.includes(g.key));
    if (!state.groups.length) throw new Error('Не знайдено груп');

    const rawRows = [];
    for (let i = 0; i < state.groups.length; i++) {
      setProgress(i + 1, state.groups.length, `Розклад: ${i + 1}/${state.groups.length}`);
      const g = state.groups[i];
      const lessons = await fetchApi('GetScheduleDataX', { aStudyGroupID: g.key, aStartDate: startDate, aEndDate: endDate, aStudyTypeID: '' });
      (Array.isArray(lessons) ? lessons : []).forEach((l) => {
        const st = clean(l.study_type || '').toLowerCase();
        rawRows.push({
          discipline: normalizeDiscipline(l.discipline),
          group: g.value,
          teachers: splitTeachers(l.employee_short || l.employee || ''),
          controlType: st.includes('іспит') ? 'іспит' : 'залік',
          date: '',
          time: '',
          room: clean(l.auditorium || l.room || '')
        });
      });
    }

    if (state.rows.length > 0) {
      if (confirm("У таблиці вже є записи. Очистити їх перед формуванням з розкладу? (Натисніть 'Скасувати', щоб просто додати нові записи до існуючих)")) {
        state.rows = [];
      }
    }
    state.rows = dedupeRows(state.rows.concat(rawRows)).filter((r) => r.discipline && r.group);
    renderFilters(state.rows);
    applyFilters();
    setStatus(state.rows.length ? `Сформовано ${state.rows.length} записів на базі розкладу` : 'Немає записів у вибраному періоді');
  }

  function normalizeAction() {
    syncFromGrid();
    state.rows = dedupeRows(state.rows.concat(state.filteredRows));
    renderFilters(state.rows);
    applyFilters();
  }

  function addCustomRow() {
    syncFromGrid();
    mergeFilteredBack();
    pushUndo();
    state.rows.push({ discipline: 'Новий предмет', group: '', teachers: [], controlType: 'залік', date: '', time: '', room: '' });
    renderFilters(state.rows);
    applyFilters();
    setTimeout(() => {
      const lastRow = els.tableBody.querySelector('tr:last-child');
      if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    saveDraftDebounced();
  }

  async function loadFromApi() {
    const term = resolveSessionTerm();
    if (!term) return showError('Оберіть або введіть назву сесії у шапці, щоб завантажити її з API');
    
    showError('');
    setStatus(`Завантаження сесії "${term}" з API...`);
    
    try {
      const res = await fetch(`/api/session?term=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      const items = (data.sessions || []).flatMap(s => s.items || []);
      if (!items.length) {
         setStatus(`У сесії "${term}" немає записів або сесію не знайдено.`);
         return;
      }
      
      const parsed = items.map(item => ({
          discipline: item.discipline || '',
          group: (item.groups && item.groups[0]) || item.groupHeading || '',
          teachers: splitTeachers(item.teacher || ''),
          controlType: CONTROL_OPTIONS.includes(clean(item.controlType).toLowerCase()) ? clean(item.controlType).toLowerCase() : 'залік',
          date: item.date || '',
          time: item.time || '',
          room: item.room || ''
      }));
      
      if (state.rows.length > 0) {
        if (confirm("У таблиці вже є записи. Очистити їх перед завантаженням з API? (Натисніть 'Скасувати', щоб додати до існуючих)")) {
          state.rows = [];
        }
      }
      
      state.rows = dedupeRows(state.rows.concat(parsed));
      renderFilters(state.rows);
      applyFilters();
      saveDraftDebounced();
      setStatus(`Завантажено ${parsed.length} записів з API для сесії "${term}".`);
      
    } catch(err) {
      showError('Помилка завантаження з API: ' + err.message);
    }
  }

  async function uploadToApi() {
    showError('');
    syncFromGrid();
    mergeFilteredBack();
    applyFilters();
    if (!state.filteredRows.length) {
      setStatus('Немає записів у таблиці. Запускаю автозбір...');
      await buildFromSchedule();
      if (!state.filteredRows.length) throw new Error('Немає записів для завантаження');
    }
    const password = clean(els.adminPassword.value);
    if (!password) throw new Error('Введіть ADMIN_PASSWORD');

    const payload = {
      password,
      actor: clean(els.adminActor.value) || 'session-constructor',
      data: {
        sourceFile: els.docxFiles.files?.[0]?.name || 'schedule-based',
        generatedAt: new Date().toISOString(),
        term: resolveSessionTerm(),
        studyForm: clean(els.studyForm.value),
        items: state.filteredRows.map((r) => ({
          groupHeading: r.group,
          groups: [r.group],
          speciality: '',
          program: '',
          controlType: r.controlType || 'залік',
          discipline: r.discipline,
          examForm: '',
          teacher: r.teachers.join('; '),
          date: r.date || '',
          time: r.time || '',
          room: r.room || '',
          sourceTable: 0,
          sourceFile: els.docxFiles.files?.[0]?.name || 'schedule-based'
        }))
      }
    };

    const res = await fetch(API_SESSION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const raw = await res.text();
    let json = null; try { json = raw ? JSON.parse(raw) : null; } catch (e) {}
    if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
    const added = Number(json.added || 0);
    const total = Number(json.count || 0);
    if (added === 0) setStatus(`Нових записів не додано (дублікати). Всього: ${total} (${json.term || ''})`);
    else setStatus(`Успішно: додано ${added}, всього ${total} (${json.term || ''})`);
  }
  async function validateOnly() {
    syncFromGrid();
    mergeFilteredBack();
    applyFilters();
    const payload = {
      action: 'validateOnly',
      data: {
        term: resolveSessionTerm(),
        studyForm: clean(els.studyForm.value),
        items: state.filteredRows.map((r) => ({
          groupHeading: r.group,
          groups: [r.group],
          controlType: r.controlType || 'залік',
          discipline: r.discipline,
          teacher: r.teachers.join('; '),
          date: r.date || '',
          time: r.controlType === 'іспит' ? (r.time || '') : '',
          room: r.room || ''
        }))
      }
    };
    const res = await fetch(API_SESSION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const raw = await res.text();
    let json = null; try { json = raw ? JSON.parse(raw) : null; } catch (e) {}
    if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
    const q = json.quality || {};
    setStatus(`Validate: conflicts=${json.conflictsCount || 0}, missing date=${q.missingDate || 0}, missing room=${q.missingRoom || 0}`);
  }

  function exportExcel() {
    syncFromGrid();
    const data = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю', 'Дата', 'Час', 'Аудиторія']];
    state.filteredRows.forEach((r, i) => data.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.time || '', r.room || '']));
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Session');
    XLSX.writeFile(wb, 'session_constructor.xlsx');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function exportWord() {
    syncFromGrid();
    if (!state.filteredRows.length) return showError('Немає даних для експорту у Word');
    const grouped = new Map();
    state.filteredRows.forEach((r) => {
      const g = clean(r.group) || '—';
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(r);
    });
    let body = '';
    Array.from(grouped.entries()).forEach(([g, list]) => {
      body += `<h3 style="margin:18px 0 8px 0;">Група: ${escapeHtml(g)}</h3>`;
      body += '<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:12pt;">';
      body += '<tr><th>№</th><th>Дисципліна</th><th>Викладачі</th><th>Форма контролю</th><th>Дата</th><th>Час</th><th>Аудиторія</th></tr>';
      list.forEach((r, i) => { body += `<tr><td>${i + 1}</td><td>${escapeHtml(r.discipline)}</td><td>${escapeHtml(r.teachers.join('; '))}</td><td>${escapeHtml(r.controlType || '')}</td><td>${escapeHtml(r.date || '')}</td><td>${escapeHtml(r.time || '')}</td><td>${escapeHtml(r.room || '')}</td></tr>`; });
      body += '</table>';
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Calibri, Arial, sans-serif;"><h2>${escapeHtml(resolveSessionTerm() || 'Сесія')}</h2>${body}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${(resolveSessionTerm() || 'session').replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function copyTable() {
    syncFromGrid();
    const lines = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю', 'Дата', 'Час', 'Аудиторія'].join('\t')];
    state.filteredRows.forEach((r, i) => lines.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.time || '', r.room || ''].join('\t')));
    await navigator.clipboard.writeText(lines.join('\n'));
    setStatus('Таблицю скопійовано');
  }

  async function initControls() {
    applySemesterPreset(clean(els.semesterPreset.value) || 'custom');
    const base = await fetchApi('GetStudentScheduleFiltersData');
    state.faculties = Array.isArray(base?.faculties) ? base.faculties : [];
    state.courses = Array.isArray(base?.courses) ? base.courses : [];
    renderSelect(els.facultySelect, state.faculties, 'Оберіть факультет');
    renderCheckboxes(els.coursesBox, state.courses, 'course');

    const refreshGroups = async () => {
      const fac = clean(els.facultySelect.value);
      if (!fac) return renderCheckboxes(els.groupsBox, [], 'group');
      const base2 = await fetchApi('GetStudentScheduleFiltersData');
      const forms = Array.isArray(base2?.educForms) ? base2.educForms : [];
      const isZaochna = clean(els.studyForm.value).toLowerCase().includes('заочн');
      const selectedForm = forms.find((x) => clean(x.Value).toLowerCase().includes(isZaochna ? 'заочн' : 'денн')) || forms[0];
      const selectedCourses = getChecked('course');
      const arr = [];
      for (let i = 0; i < selectedCourses.length; i++) {
        const res = await fetchApi('GetStudyGroups', { aFacultyID: fac, aEducationForm: selectedForm?.Key || '', aCourse: selectedCourses[i] });
        (res?.studyGroups || []).forEach((g) => arr.push({ key: String(g.Key), value: clean(g.Value) }));
      }
      const unique = Array.from(new Map(arr.map((x) => [x.key, x])).values()).sort((a, b) => a.value.localeCompare(b.value, 'uk'));
      renderCheckboxes(els.groupsBox, unique, 'group');
    };

    els.facultySelect.addEventListener('change', () => refreshGroups().catch((e) => showError(e.message || String(e))));
    els.studyForm.addEventListener('change', () => refreshGroups().catch((e) => showError(e.message || String(e))));
    els.semesterPreset.addEventListener('change', () => applySemesterPreset(clean(els.semesterPreset.value)));
    els.coursesBox.addEventListener('change', () => refreshGroups().catch((e) => showError(e.message || String(e))));
    els.selectAllCourses.addEventListener('click', () => { setChecked('course', true); refreshGroups(); });
    els.clearCourses.addEventListener('click', () => { setChecked('course', false); refreshGroups(); });
    els.selectAllGroups.addEventListener('click', () => setChecked('group', true));
    els.clearGroups.addEventListener('click', () => setChecked('group', false));

    await refreshGroups();
  }

  // --- Save / Load session as JSON file ---
  function saveSession() {
    syncFromGrid();
    mergeFilteredBack();
    const payload = getDraftPayload();
    payload.savedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const termSlug = (resolveSessionTerm() || 'session').replace(/[^a-zA-Z0-9а-яА-ЯіІїЇєЄґҐ]+/giu, '_').slice(0, 40);
    a.download = `session_${termSlug}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setStatus('Сесію збережено у файл');
  }

  function loadSession(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data || !Array.isArray(data.rows)) {
          showError('Невалідний файл сесії: немає масиву rows');
          return;
        }
        // Restore fields
        const f = data.fields || {};
        if (typeof f.sessionTerm === 'string') els.sessionTerm.value = f.sessionTerm;
        if (els.sessionTermSelect && typeof f.sessionTermSelect === 'string') els.sessionTermSelect.value = f.sessionTermSelect;
        if (typeof f.studyForm === 'string') els.studyForm.value = f.studyForm;
        if (typeof f.facultySelect === 'string') els.facultySelect.value = f.facultySelect;
        if (typeof f.semesterPreset === 'string') els.semesterPreset.value = f.semesterPreset;
        if (typeof f.startDate === 'string') els.startDate.value = f.startDate;
        if (typeof f.endDate === 'string') els.endDate.value = f.endDate;
        if (typeof f.zalikStartDate === 'string') els.zalikStartDate.value = f.zalikStartDate;
        if (typeof f.zalikEndDate === 'string') els.zalikEndDate.value = f.zalikEndDate;
        if (typeof f.examStartDate === 'string') els.examStartDate.value = f.examStartDate;
        if (typeof f.examEndDate === 'string') els.examEndDate.value = f.examEndDate;
        // Restore rows
        state.rows = data.rows.map((r) => ({ ...r, teachers: Array.isArray(r.teachers) ? r.teachers : splitTeachers(r.teachers || '') }));
        renderFilters(state.rows);
        applyFilters();
        setMode(data.mode || 'basic');
        saveDraftDebounced();
        const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString('uk-UA') : '';
        setStatus(`Сесію завантажено з файлу${savedAt ? ' (збережено ' + savedAt + ')' : ''}: ${state.rows.length} записів`);
        showError('');
      } catch (err) {
        showError('Помилка читання файлу сесії: ' + (err.message || String(err)));
      }
    };
    reader.onerror = () => showError('Помилка читання файлу.');
    reader.readAsText(file);
  }

  els.parseBtn.addEventListener('click', () => buildFromSchedule().catch((e) => showError(e.message || String(e))));
  els.loadApiBtn?.addEventListener('click', () => loadFromApi().catch((e) => showError(e.message || String(e))));
  els.normalizeBtn.addEventListener('click', normalizeAction);
  els.addRowBtn.addEventListener('click', addCustomRow);
  els.uploadBtn.addEventListener('click', () => uploadToApi().catch((e) => showError(e.message || String(e))));
  els.excelBtn.addEventListener('click', exportExcel);
  els.wordBtn.addEventListener('click', exportWord);
  els.copyBtn.addEventListener('click', () => copyTable().catch((e) => showError(e.message || String(e))));
  els.saveSessionBtn?.addEventListener('click', saveSession);
  els.loadSessionBtn?.addEventListener('click', () => els.loadSessionFile?.click());
  els.loadSessionFile?.addEventListener('change', () => {
    const file = els.loadSessionFile.files?.[0];
    if (file) loadSession(file);
    els.loadSessionFile.value = ''; // allow re-selecting same file
  });
  els.autoPlanBtn.addEventListener('click', autoPlanDates);
  // Print
  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  // Undo/Redo buttons
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  
  // Smart filters
  const updateFilterBtns = () => {
    els.filterConflictsBtn.classList.toggle('bg-rose-100', state.filterConflictsOnly);
    els.filterConflictsBtn.classList.toggle('text-rose-700', state.filterConflictsOnly);
    els.filterMissingBtn.classList.toggle('bg-amber-100', state.filterMissingOnly);
    els.filterMissingBtn.classList.toggle('text-amber-700', state.filterMissingOnly);
  };
  els.filterConflictsBtn?.addEventListener('click', () => {
    state.filterConflictsOnly = !state.filterConflictsOnly;
    updateFilterBtns();
    applyFilters();
  });
  els.filterMissingBtn?.addEventListener('click', () => {
    state.filterMissingOnly = !state.filterMissingOnly;
    updateFilterBtns();
    applyFilters();
  });
  
  // Bulk shift
  els.shiftMinusBtn?.addEventListener('click', () => shiftSelectedDates(-1));
  els.shiftPlusBtn?.addEventListener('click', () => shiftSelectedDates(1));

  // Sort headers
  document.querySelector('thead')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) toggleSort(th.dataset.sort);
  });
  els.conflictsBtn.addEventListener('click', () => { syncFromGrid(); detectConflicts(true); renderTable(state.filteredRows); });
  els.suggestionsBtn.addEventListener('click', buildSuggestions);
  els.validateOnlyBtn?.addEventListener('click', () => validateOnly().catch((e) => showError(e.message || String(e))));
  els.applyBulkBtn.addEventListener('click', applyBulkToSelected);
  els.searchInput.addEventListener('input', applyFilters);
  els.groupFilter.addEventListener('change', applyFilters);
  els.teacherFilter.addEventListener('change', applyFilters);

  els.tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act="del"]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (Number.isNaN(i)) return;
    syncFromGrid();
    pushUndo();
    state.filteredRows.splice(i, 1);
    mergeFilteredBack();
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
  });

  els.tableBody.addEventListener('change', (e) => {
    const rowCb = e.target.closest('input[data-act="select-row"]');
    if (rowCb) {
      syncFromGrid();
      saveDraftDebounced();
      return;
    }
    const sel = e.target.closest('select[data-f="controlType"]');
    if (!sel) return;
    syncFromGrid();
    // Update just this row's color without full re-render
    const idx = Number(sel.dataset.i);
    const tr = sel.closest('tr');
    const ct = clean(sel.value).toLowerCase();
    const colors = CONTROL_COLORS[ct] || CONTROL_COLORS['залік'];
    if (tr) {
      tr.style.backgroundColor = colors.bg;
      tr.style.borderLeft = '4px solid ' + colors.border;
    }
    saveDraftDebounced();
  });

  let liveTimer = null;
  const triggerLiveChecks = () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      syncFromGrid();
      saveDraftDebounced();
      // Do NOT call detectConflicts/renderTable here — it destroys focus while typing
    }, 400);
  };
  els.tableBody.addEventListener('input', triggerLiveChecks);
  // Run conflict detection only on blur — but NOT if focus is moving to another element in the table
  let focusoutTimer = null;
  els.tableBody.addEventListener('focusout', (e) => {
    clearTimeout(liveTimer);
    clearTimeout(focusoutTimer);
    // Delay to let the new focusin fire first
    focusoutTimer = setTimeout(() => {
      // If focus is still inside the table, don't re-render
      if (els.tableBody.contains(document.activeElement)) {
        syncFromGrid();
        saveDraftDebounced();
        return;
      }
      syncFromGrid();
      // Auto-detect control type when discipline changes
      const inp = e.target;
      if (inp && inp.dataset && inp.dataset.f === 'discipline') {
        const idx = Number(inp.dataset.i);
        const row = state.filteredRows[idx];
        if (row) {
          const detected = autoDetectControlType(inp.value);
          if (detected && row.controlType === 'залік') {
            row.controlType = detected;
          }
        }
      }
      detectConflicts(false);
      saveDraftDebounced();
    }, 100);
  });
  // Ctrl+Z / Ctrl+Y for undo/redo
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  });

  // Excel-like Keyboard Navigation
  els.tableBody.addEventListener('keydown', (e) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
    if (!keys.includes(e.key) || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    
    // Ignore if typing in a text field and pressing Left/Right
    const t = e.target;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (t.type === 'text' || t.type === 'search') && t.selectionStart !== t.selectionEnd && t.value.length > 0) return;
    
    const tr = t.closest('tr');
    const td = t.closest('td');
    if (!tr || !td) return;
    
    e.preventDefault();
    let nextEl = null;
    
    if (e.key === 'ArrowRight') {
      nextEl = td.nextElementSibling?.querySelector('input:not([type="checkbox"]), select, button');
    } else if (e.key === 'ArrowLeft') {
      nextEl = td.previousElementSibling?.querySelector('input:not([type="checkbox"]), select, button');
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      const nextTr = tr.nextElementSibling;
      if (nextTr) {
        const cellIdx = Array.from(tr.children).indexOf(td);
        nextEl = nextTr.children[cellIdx]?.querySelector('input, select, button');
      }
    } else if (e.key === 'ArrowUp') {
      const prevTr = tr.previousElementSibling;
      if (prevTr) {
        const cellIdx = Array.from(tr.children).indexOf(td);
        nextEl = prevTr.children[cellIdx]?.querySelector('input, select, button');
      }
    }
    
    if (nextEl) {
      nextEl.focus();
      if (nextEl.select && typeof nextEl.select === 'function') nextEl.select();
    }
  });

  // Drag and Drop Rows
  let draggedIndex = null;
  els.tableBody.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.dragIndex === undefined) return;
    draggedIndex = Number(tr.dataset.dragIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedIndex);
    tr.classList.add('opacity-50');
  });
  els.tableBody.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.dragIndex !== undefined) {
      tr.classList.add('border-t-2', 'border-violet-500');
    }
  });
  els.tableBody.addEventListener('dragleave', (e) => {
    const tr = e.target.closest('tr');
    if (tr) tr.classList.remove('border-t-2', 'border-violet-500');
  });
  els.tableBody.addEventListener('dragend', (e) => {
    const tr = e.target.closest('tr');
    if (tr) tr.classList.remove('opacity-50');
    Array.from(els.tableBody.children).forEach(r => r.classList.remove('border-t-2', 'border-violet-500'));
  });
  els.tableBody.addEventListener('drop', (e) => {
    e.preventDefault();
    const tr = e.target.closest('tr');
    Array.from(els.tableBody.children).forEach(r => r.classList.remove('border-t-2', 'border-violet-500'));
    if (draggedIndex === null || !tr || tr.dataset.dragIndex === undefined) return;
    
    const targetIndex = Number(tr.dataset.dragIndex);
    if (draggedIndex === targetIndex) return;
    
    syncFromGrid();
    pushUndo();
    
    const item = state.filteredRows.splice(draggedIndex, 1)[0];
    state.filteredRows.splice(targetIndex, 0, item);
    
    mergeFilteredBack();
    renderTable(state.filteredRows);
    saveDraftDebounced();
  });
  els.selectAllRows?.addEventListener('change', () => {
    const checked = !!els.selectAllRows.checked;
    state.filteredRows.forEach((r) => {
      const key = rowKey(r);
      if (checked) state.selectedRowKeys.add(key);
      else state.selectedRowKeys.delete(key);
    });
    renderTable(state.filteredRows);
    saveDraftDebounced();
  });
  els.modeBasicBtn?.addEventListener('click', () => setMode('basic'));
  els.modeProBtn?.addEventListener('click', () => setMode('pro'));
  els.presetWinterBtn?.addEventListener('click', () => applyDatePreset('winter'));
  els.presetSummerBtn?.addEventListener('click', () => applyDatePreset('summer'));
  els.presetThisMonthBtn?.addEventListener('click', () => applyDatePreset('month'));
  els.presetNext7Btn?.addEventListener('click', () => applyDatePreset('next7'));
  els.conflictMode?.addEventListener('change', () => { detectConflicts(false); saveDraftDebounced(); });
  [els.sessionTerm, els.sessionTermSelect, els.studyForm, els.startDate, els.endDate, els.zalikStartDate, els.zalikEndDate, els.examStartDate, els.examEndDate].forEach((el) => {
    el?.addEventListener('change', () => { validateYearRanges(); saveDraftDebounced(); });
  });
  els.clearDraftBtn?.addEventListener('click', () => {
    if (!confirm('Ви впевнені, що хочете видалити всі записи з таблиці та очистити чернетку?')) return;
    localStorage.removeItem(DRAFT_KEY);
    state.rows = [];
    state.filteredRows = [];
    renderFilters(state.rows);
    applyFilters();
    if (els.draftInfo) els.draftInfo.textContent = 'Чернетку очищено';
  });
  els.qualityPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-q]');
    if (!btn) return;
    const key = btn.dataset.q;
    if (key === 'Missing date') {
      state.filteredRows = state.rows.filter((r) => !clean(r.date));
    } else if (key === 'Missing time (exam)') {
      state.filteredRows = state.rows.filter((r) => clean(r.controlType) === 'іспит' && !clean(r.time));
    } else if (key === 'Missing room (exam)') {
      state.filteredRows = state.rows.filter((r) => clean(r.controlType) === 'іспит' && !clean(r.room));
    } else if (key === 'Missing teacher') {
      state.filteredRows = state.rows.filter((r) => !(r.teachers || []).length);
    } else {
      applyFilters();
      return;
    }
    detectConflicts(false);
  });

  // --- DOCX file parsing via mammoth.js ---
  function parseDocxFile(file) {
    if (!file) return;
    if (!window.mammoth) {
      showError('mammoth.js не завантажений. Перезавантажте сторінку.');
      return;
    }
    setStatus('Парсинг DOCX файлу...');
    const reader = new FileReader();
    reader.onload = function (evt) {
      mammoth.convertToHtml({ arrayBuffer: evt.target.result })
        .then((result) => {
          const html = result.value;
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const tables = doc.querySelectorAll('table');
          if (!tables.length) {
            showError('У DOCX файлі не знайдено таблиць.');
            return;
          }
          const parsed = [];
          tables.forEach((tbl) => {
            const trs = tbl.querySelectorAll('tr');
            trs.forEach((tr, ri) => {
              if (ri === 0) return; // skip header
              const cells = Array.from(tr.querySelectorAll('td')).map((td) => clean(td.textContent));
              if (cells.length < 2) return;
              // Try to extract: discipline, group, teachers, controlType, date, time, room
              const discipline = normalizeDiscipline(cells[1] || cells[0] || '');
              const group = clean(cells[2] || cells[3] || '');
              const teachers = splitTeachers(cells[3] || cells[4] || '');
              let controlType = clean(cells[4] || cells[5] || '').toLowerCase();
              if (!CONTROL_OPTIONS.includes(controlType)) controlType = 'залік';
              const date = clean(cells[5] || cells[6] || '');
              const time = clean(cells[6] || cells[7] || '');
              const room = clean(cells[7] || cells[8] || '');
              if (discipline) {
                parsed.push({ discipline, group, teachers, controlType, date, time, room });
              }
            });
          });
          if (!parsed.length) {
            showError('Не вдалося розпізнати записи з DOCX таблиць.');
            return;
          }
          syncFromGrid();
          mergeFilteredBack();
          state.rows = dedupeRows(state.rows.concat(parsed));
          renderFilters(state.rows);
          applyFilters();
          saveDraftDebounced();
          setStatus(`З DOCX файлу додано ${parsed.length} записів.`);
          showError('');
        })
        .catch((err) => {
          showError('Помилка парсингу DOCX: ' + (err.message || String(err)));
        });
    };
    reader.onerror = () => showError('Помилка читання файлу.');
    reader.readAsArrayBuffer(file);
  }

  // --- XLSX/XLS file parsing via SheetJS ---
  function parseExcelFile(file) {
    if (!file) return;
    if (!window.XLSX) {
      showError('SheetJS не завантажений. Перезавантажте сторінку.');
      return;
    }
    setStatus('Парсинг Excel файлу...');
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const parsed = [];
        wb.SheetNames.forEach((name) => {
          const ws = wb.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (!data.length) return;
          // Skip header row, parse remaining
          for (let ri = 1; ri < data.length; ri++) {
            const cells = (data[ri] || []).map((c) => clean(String(c || '')));
            if (cells.length < 2) continue;
            const discipline = normalizeDiscipline(cells[1] || cells[0] || '');
            const group = clean(cells[2] || cells[3] || '');
            const teachers = splitTeachers(cells[3] || cells[4] || '');
            let controlType = clean(cells[4] || cells[5] || '').toLowerCase();
            if (!CONTROL_OPTIONS.includes(controlType)) controlType = 'залік';
            const date = clean(cells[5] || cells[6] || '');
            const time = clean(cells[6] || cells[7] || '');
            const room = clean(cells[7] || cells[8] || '');
            if (discipline) {
              parsed.push({ discipline, group, teachers, controlType, date, time, room });
            }
          }
        });
        if (!parsed.length) {
          showError('Не вдалося розпізнати записи з Excel файлу.');
          return;
        }
        syncFromGrid();
        mergeFilteredBack();
        state.rows = dedupeRows(state.rows.concat(parsed));
        renderFilters(state.rows);
        applyFilters();
        saveDraftDebounced();
        setStatus(`З Excel файлу додано ${parsed.length} записів.`);
        showError('');
      } catch (err) {
        showError('Помилка парсингу Excel: ' + (err.message || String(err)));
      }
    };
    reader.onerror = () => showError('Помилка читання файлу.');
    reader.readAsArrayBuffer(file);
  }

  if (els.docxFiles) {
    els.docxFiles.addEventListener('change', () => {
      const file = els.docxFiles.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'docx') {
        parseDocxFile(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        parseExcelFile(file);
      } else {
        showError('Непідтримуваний формат файлу. Використовуйте .docx, .xlsx або .xls');
      }
    });
  }

  // --- Save on page unload to prevent data loss ---
  window.addEventListener('beforeunload', () => {
    syncFromGrid();
    mergeFilteredBack();
    saveDraft();
  });

  renderSelect(els.groupFilter, [], 'Усі групи');
  renderSelect(els.teacherFilter, [], 'Усі викладачі');
  if (els.conflictSummary) els.conflictSummary.textContent = 'Конфліктів: 0';
  setProgress(0, 1, 'Готово');
  setMode('basic');
  loadSessionTerms();

  // Restore draft FIRST, then init controls (so API failure doesn't lose data)
  restoreDraft();
  initControls()
    .then(() => {
      // Re-apply draft on top of loaded controls if rows exist
      if (!state.rows.length) restoreDraft();
    })
    .catch((e) => {
      showError('API недоступний, але чернетка відновлена: ' + (e.message || String(e)));
    });
})();
