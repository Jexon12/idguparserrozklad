(function () {
  const API_PROXY = '/api/';
  const API_SESSION = '/api/session';
  const VUZ_ID = 11927;
  const CONTROL_OPTIONS = ['залік', 'іспит', 'захист', 'диф.залік'];
  const CONTROL_COLORS = {
    'залік': { bg: '#d1fae5', border: '#10b981' },
    'іспит': { bg: '#dbeafe', border: '#3b82f6' },
    'захист': { bg: '#fef3c7', border: '#f59e0b' },
    'диф.залік': { bg: '#ede9fe', border: '#8b5cf6' }
  };
  const DRAFT_KEY = 'session_constructor_draft_v1';
  const VIEW_STATE_KEY = 'session_constructor_view_state_v1';
  const SNAPSHOT_KEY = 'session_constructor_snapshots_v1';

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
    disciplineFilter: document.getElementById('disciplineFilter'),
    groupFilter: document.getElementById('groupFilter'),
    teacherFilter: document.getElementById('teacherFilter'),
    controlTypeFilter: document.getElementById('controlTypeFilter'),
    dateFilter: document.getElementById('dateFilter'),
    timeFilter: document.getElementById('timeFilter'),
    roomFilter: document.getElementById('roomFilter'),
    emptyFieldFilter: document.getElementById('emptyFieldFilter'),
    groupBySelect: document.getElementById('groupBySelect'),
    problemFilterBtn: document.getElementById('problemFilterBtn'),
    dateFromFilter: document.getElementById('dateFromFilter'),
    dateToFilter: document.getElementById('dateToFilter'),
    selectFilteredBtn: document.getElementById('selectFilteredBtn'),
    exportScope: document.getElementById('exportScope'),
    toggleToolsBtn: document.getElementById('toggleToolsBtn'),
    advancedToolsPanel: document.getElementById('advancedToolsPanel'),
    columnToggles: document.getElementById('columnToggles'),
    tableViewBtn: document.getElementById('tableViewBtn'),
    calendarViewBtn: document.getElementById('calendarViewBtn'),
    normalizeTeachersBtn: document.getElementById('normalizeTeachersBtn'),
    compareApiBtn: document.getElementById('compareApiBtn'),
    snapshotBtn: document.getElementById('snapshotBtn'),
    snapshotSelect: document.getElementById('snapshotSelect'),
    restoreSnapshotBtn: document.getElementById('restoreSnapshotBtn'),
    activeFiltersLabel: document.getElementById('activeFiltersLabel'),
    shownCountLabel: document.getElementById('shownCountLabel'),
    totalCountLabel: document.getElementById('totalCountLabel'),
    presetExamsBtn: document.getElementById('presetExamsBtn'),
    presetTodayBtn: document.getElementById('presetTodayBtn'),
    presetWeekBtn: document.getElementById('presetWeekBtn'),
    presetMissingRoomBtn: document.getElementById('presetMissingRoomBtn'),
    presetTeacherConflictsBtn: document.getElementById('presetTeacherConflictsBtn'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
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
    filterMissingBtn: document.getElementById('filterMissingBtn'),
    conflictMode: document.getElementById('conflictMode'),
    validateOnlyBtn: document.getElementById('validateOnlyBtn'),
    qualityPanel: document.getElementById('qualityPanel'),
    clearDraftBtn: document.getElementById('clearDraftBtn'),
    renderInfo: document.getElementById('renderInfo'),
    daySummaryPanel: document.getElementById('daySummaryPanel'),
    calendarPanel: document.getElementById('calendarPanel'),
    rowDetailPanel: document.getElementById('rowDetailPanel')
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
    renderLimit: 500,
    sortField: null,
    sortAsc: true,
    undoStack: [],
    redoStack: [],
    maxUndo: 30,
    filterConflictsOnly: false,
    filterMissingOnly: false,
    overloadIndices: new Set(),
    warningIndices: new Set(),
    warnings: [],
    qualityFilter: '',
    groupBy: '',
    quickDateFrom: '',
    quickDateTo: '',
    problemsOnly: false,
    viewMode: 'table',
    hiddenColumns: new Set(),
    lastControlTypeFilter: ''
  };
  let conflictsWorker = null;
  let conflictRequestId = 0;

  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeDiscipline = (v) => clean(v).replace(/^[\d\.\-\)\(]+\s*/g, '').replace(/[;:,]+$/g, '').trim();
  const splitTeachers = (v) => Array.from(new Set(clean(v).replace(/\s*(,|\/|\|)\s*/g, '; ').replace(/\s+та\s+/giu, '; ').split(';').map(clean).filter(Boolean)));
  const rowKey = (r) => String(r.id || `${clean(r.discipline)}__${clean(r.group)}__${clean(r.controlType)}`);
  const generateId = () => 'r_' + Math.random().toString(36).slice(2, 11);
  const CONTROL_PRIORITY = { 'іспит': 4, 'диф.залік': 3, 'захист': 2, 'залік': 1 };
  const selectValues = (el) => el ? Array.from(el.selectedOptions || []).map((o) => clean(o.value)).filter(Boolean) : [];
  const matchesAny = (values, actual, normalizer = clean) => !values.length || values.some((value) => normalizer(actual) === normalizer(value));
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const addDaysIso = (iso, days) => {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const rowProblemFlags = (r) => {
    const idx = state.rows.findIndex((x) => String(x.id) === String(r.id));
    const isExam = clean(r.controlType).toLowerCase() === 'іспит';
    return {
      conflict: state.conflictIndices.has(idx),
      overload: state.overloadIndices.has(idx),
      warning: state.warningIndices.has(idx),
      missing: !clean(r.date) || !clean(r.teachers?.join('')) || (isExam && (!clean(r.time) || !clean(r.room))),
      duplicate: isDuplicateRow(r)
    };
  };

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

  function dedupeRows(rows, ignoreDateTime = false) {
    const map = new Map();
    rows.forEach((r) => {
      const d = normalizeDiscipline(r.discipline);
      const g = clean(r.group);
      const ct = clean(r.controlType || 'залік').toLowerCase();
      const dt = ignoreDateTime ? '' : clean(r.date);
      const tm = ignoreDateTime ? '' : clean(r.time);
      
      if (!d || !g) return;
      
      // Ключ залежить від того, чи хочемо ми бачити різні дати як окремі записи
      const key = `${d}__${g}__${ct}__${dt}__${tm}`;
      
      if (!map.has(key)) {
        map.set(key, { 
          id: r.id || generateId(),
          discipline: d, 
          group: g, 
          teachers: new Set(r.teachers || []), 
          controlType: ct, 
          date: clean(r.date || ''), 
          time: clean(r.time || ''), 
          room: clean(r.room || '') 
        });
      } else {
        const existing = map.get(key);
        if (r.teachers) splitTeachers(Array.isArray(r.teachers) ? r.teachers.join('; ') : r.teachers).forEach((t) => existing.teachers.add(t));
        if (!existing.date && r.date) existing.date = clean(r.date);
        if (!existing.time && r.time) existing.time = clean(r.time);
        if (!existing.room && r.room) existing.room = clean(r.room);
      }
    });
    return Array.from(map.values()).map((x) => ({
      ...x,
      teachers: Array.from(x.teachers).sort((a, b) => a.localeCompare(b, 'uk'))
    }));
  }

  function renderFilters(rows) {
    const keep = {
      discipline: selectValues(els.disciplineFilter),
      group: selectValues(els.groupFilter),
      teacher: selectValues(els.teacherFilter),
      controlType: selectValues(els.controlTypeFilter),
      date: selectValues(els.dateFilter),
      time: selectValues(els.timeFilter),
      room: selectValues(els.roomFilter)
    };
    const setOptions = (select, values, label) => {
      if (!select) return;
      select.innerHTML = '';
      const first = document.createElement('option');
      first.value = '';
      first.textContent = label;
      select.appendChild(first);
      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    };
    const restore = (el, values) => {
      if (!el) return;
      const selected = new Set(values || []);
      Array.from(el.options || []).forEach((o) => { o.selected = selected.has(o.value); });
    };
    const uniqueGroupsMap = new Map();
    rows.forEach(r => {
      if (!r.group) return;
      const key = r.group.toUpperCase();
      if (!uniqueGroupsMap.has(key)) uniqueGroupsMap.set(key, r.group.toUpperCase()); // Convert everything to uppercase for consistency
    });
    const groups = Array.from(uniqueGroupsMap.values()).sort((a, b) => a.localeCompare(b, 'uk'));
    
    const disciplines = Array.from(new Set(rows.map((r) => r.discipline).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    const teachers = Array.from(new Set(rows.flatMap((r) => r.teachers).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    const dates = Array.from(new Set(rows.map((r) => r.date).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    const times = Array.from(new Set(rows.map((r) => r.time).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    const rooms = Array.from(new Set(rows.map((r) => r.room).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
    setOptions(els.disciplineFilter, disciplines, 'Усі предмети');
    setOptions(els.groupFilter, groups, 'Усі групи');
    setOptions(els.teacherFilter, teachers, 'Усі викладачі');
    setOptions(els.dateFilter, dates, 'Усі дати');
    setOptions(els.timeFilter, times, 'Увесь час');
    setOptions(els.roomFilter, rooms, 'Усі аудиторії');
    restore(els.disciplineFilter, keep.discipline);
    restore(els.groupFilter, keep.group);
    restore(els.teacherFilter, keep.teacher);
    restore(els.controlTypeFilter, keep.controlType);
    restore(els.dateFilter, keep.date);
    restore(els.timeFilter, keep.time);
    restore(els.roomFilter, keep.room);
    // Update datalists for autocomplete
    updateDatalist('dl-disciplines', disciplines);
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
    let currentGroup = null;
    visibleRows.forEach((r, i) => {
      const label = groupLabel(r);
      if (label && label !== currentGroup) {
        currentGroup = label;
        const groupTr = document.createElement('tr');
        groupTr.className = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200';
        const count = rows.filter((x) => groupLabel(x) === label).length;
        groupTr.innerHTML = `<td colspan="11" class="px-3 py-2 text-xs font-bold uppercase tracking-wide">${label} · ${count}</td>`;
        els.tableBody.appendChild(groupTr);
      }
      const tr = document.createElement('tr');
      const currentControl = CONTROL_OPTIONS.includes(clean(r.controlType).toLowerCase()) ? clean(r.controlType).toLowerCase() : 'залік';
      const key = r.id;
      const checked = state.selectedRowKeys.has(key) ? 'checked' : '';
      const colors = CONTROL_COLORS[currentControl] || CONTROL_COLORS['залік'];
      tr.draggable = true;
      tr.dataset.id = r.id;
      tr.innerHTML = `
        <td data-col-key="select" class="px-2 py-2 sticky-col-1"><input type="checkbox" data-act="select-row" data-id="${r.id}" ${checked}></td>
        <td data-col-key="number" class="px-2 py-2 sticky-col-2">${i + 1}</td>
        <td data-col-key="discipline" class="px-2 py-2 sticky-col-3"><input data-f="discipline" data-id="${r.id}" list="dl-disciplines" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.discipline || '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="group" class="px-2 py-2"><input data-f="group" data-id="${r.id}" list="dl-groups" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.group || '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="teacher1" class="px-2 py-2"><input data-f="teachers1" data-id="${r.id}" list="dl-teachers" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.teachers && r.teachers[0] ? r.teachers[0] : '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="teacher2" class="px-2 py-2"><input data-f="teachers2" data-id="${r.id}" list="dl-teachers" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.teachers && r.teachers[1] ? r.teachers[1] : '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="controlType" class="px-2 py-2"><select data-f="controlType" data-id="${r.id}" class="w-full rounded border p-1 bg-white dark:bg-gray-700">${CONTROL_OPTIONS.map((o) => `<option value="${o}" ${currentControl === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td data-col-key="date" class="px-2 py-2"><input data-f="date" data-id="${r.id}" type="date" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.date || '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="time" class="px-2 py-2"><input data-f="time" data-id="${r.id}" type="time" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.time || '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="room" class="px-2 py-2"><input data-f="room" data-id="${r.id}" list="dl-rooms" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.room || '').replace(/"/g, '&quot;')}"></td>
        <td data-col-key="action" class="px-2 py-2"><button data-act="del" data-id="${r.id}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити</button></td>
      `;
      const globalIdx = state.rows.findIndex(x => x.id === r.id);
      if (state.conflictIndices.has(globalIdx)) {
        tr.style.backgroundColor = '#fee2e2';
        tr.style.borderLeft = '4px solid #ef4444';
      } else if (state.overloadIndices && state.overloadIndices.has(globalIdx)) {
        tr.style.backgroundColor = '#fef9c3';
        tr.style.borderLeft = '4px solid #facc15';
        tr.title = 'Попередження: викладач має більше 2-х іспитів/заліків у цей день!';
      } else if (state.warningIndices && state.warningIndices.has(globalIdx)) {
        tr.style.backgroundColor = '#ffedd5';
        tr.style.borderLeft = '4px solid #fb923c';
        tr.title = (state.warnings || []).filter((w) => w.index === globalIdx).map((w) => w.message).join('; ');
      } else {
        tr.style.backgroundColor = colors.bg;
        tr.style.borderLeft = '4px solid ' + colors.border;
      }
      const q = clean(els.searchInput?.value).toLowerCase();
      if (q) {
        tr.querySelectorAll('input[data-f], select[data-f]').forEach((el) => {
          if (clean(el.value).toLowerCase().includes(q)) el.classList.add('ring-2', 'ring-yellow-300');
        });
      }
      els.tableBody.appendChild(tr);
    });
    els.countLabel.textContent = String(rows.length);
    if (els.shownCountLabel) els.shownCountLabel.textContent = String(rows.length);
    if (els.totalCountLabel) els.totalCountLabel.textContent = String(state.rows.length);
    if (els.activeFiltersLabel) els.activeFiltersLabel.textContent = String(getActiveFilterCount());
    if (els.renderInfo) {
      if (rows.length > state.renderLimit) els.renderInfo.textContent = `Показано ${state.renderLimit} з ${rows.length} / всього ${state.rows.length} (для швидкості)`;
      else els.renderInfo.textContent = `Показано ${rows.length} з ${state.rows.length}`;
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
    els.qualityPanel.innerHTML = items.map(([k, v]) => `<button data-q="${k}" class="text-left px-2 py-1 rounded border dark:border-gray-600 ${state.qualityFilter === k ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100' : 'bg-white dark:bg-gray-700'}"><div class="text-[11px] text-gray-500">${k}</div><div class="font-bold">${v}</div></button>`).join('');
  }

  function getTableFilters() {
    const out = {};
    document.querySelectorAll('[data-table-filter]').forEach((el) => {
      out[el.dataset.tableFilter] = clean(el.value);
    });
    return out;
  }

  function duplicateKey(r) {
    return `${clean(r.discipline).toLowerCase()}__${clean(r.group).toLowerCase()}__${clean(r.controlType).toLowerCase()}`;
  }

  function isDuplicateRow(row) {
    const key = duplicateKey(row);
    return state.rows.filter((r) => duplicateKey(r) === key).length > 1;
  }

  function groupLabel(row) {
    const mode = clean(state.groupBy);
    if (mode === 'date') return clean(row.date) || 'Без дати';
    if (mode === 'group') return clean(row.group) || 'Без групи';
    if (mode === 'teacher') return clean((row.teachers || [])[0]) || 'Без викладача';
    if (mode === 'controlType') return clean(row.controlType) || 'Без форми';
    return '';
  }

  function getActiveFilterCount() {
    let count = clean(els.searchInput?.value) ? 1 : 0;
    [els.disciplineFilter, els.groupFilter, els.teacherFilter, els.controlTypeFilter, els.dateFilter, els.timeFilter, els.roomFilter]
      .forEach((el) => { count += selectValues(el).length; });
    if (clean(els.emptyFieldFilter?.value)) count += 1;
    if (state.filterConflictsOnly) count += 1;
    if (state.filterMissingOnly) count += 1;
    if (state.qualityFilter) count += 1;
    if (state.quickDateFrom || state.quickDateTo) count += 1;
    if (clean(els.dateFromFilter?.value) || clean(els.dateToFilter?.value)) count += 1;
    if (state.problemsOnly) count += 1;
    const tableFilters = getTableFilters();
    count += Object.values(tableFilters).filter(Boolean).length;
    return count;
  }

  function saveViewState() {
    try {
      const tableFilters = getTableFilters();
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
        q: clean(els.searchInput?.value),
        discipline: selectValues(els.disciplineFilter),
        group: selectValues(els.groupFilter),
        teacher: selectValues(els.teacherFilter),
        controlType: selectValues(els.controlTypeFilter),
        date: selectValues(els.dateFilter),
        time: selectValues(els.timeFilter),
        room: selectValues(els.roomFilter),
        emptyField: clean(els.emptyFieldFilter?.value),
        groupBy: clean(els.groupBySelect?.value),
        dateFrom: clean(els.dateFromFilter?.value),
        dateTo: clean(els.dateToFilter?.value),
        exportScope: clean(els.exportScope?.value),
        quickDateFrom: state.quickDateFrom,
        quickDateTo: state.quickDateTo,
        problemsOnly: state.problemsOnly,
        viewMode: state.viewMode,
        hiddenColumns: Array.from(state.hiddenColumns),
        tableFilters,
        filterConflictsOnly: state.filterConflictsOnly,
        filterMissingOnly: state.filterMissingOnly,
        qualityFilter: state.qualityFilter
      }));
    } catch (e) {}
  }

  function restoreViewState() {
    try {
      const raw = localStorage.getItem(VIEW_STATE_KEY);
      if (!raw) return;
      const view = JSON.parse(raw);
      if (els.searchInput) els.searchInput.value = view.q || '';
      const setMulti = (el, values) => {
        const selected = new Set(Array.isArray(values) ? values : []);
        Array.from(el?.options || []).forEach((o) => { o.selected = selected.has(o.value); });
      };
      setMulti(els.disciplineFilter, view.discipline);
      setMulti(els.groupFilter, view.group);
      setMulti(els.teacherFilter, view.teacher);
      setMulti(els.controlTypeFilter, view.controlType);
      setMulti(els.dateFilter, view.date);
      setMulti(els.timeFilter, view.time);
      setMulti(els.roomFilter, view.room);
      if (els.emptyFieldFilter) els.emptyFieldFilter.value = view.emptyField || '';
      if (els.groupBySelect) els.groupBySelect.value = view.groupBy || '';
      if (els.dateFromFilter) els.dateFromFilter.value = view.dateFrom || '';
      if (els.dateToFilter) els.dateToFilter.value = view.dateTo || '';
      if (els.exportScope && view.exportScope) els.exportScope.value = view.exportScope;
      state.groupBy = clean(view.groupBy);
      state.quickDateFrom = clean(view.quickDateFrom);
      state.quickDateTo = clean(view.quickDateTo);
      state.problemsOnly = !!view.problemsOnly;
      state.viewMode = clean(view.viewMode) || 'table';
      state.hiddenColumns = new Set(Array.isArray(view.hiddenColumns) ? view.hiddenColumns : []);
      state.filterConflictsOnly = !!view.filterConflictsOnly;
      state.filterMissingOnly = !!view.filterMissingOnly;
      state.qualityFilter = clean(view.qualityFilter);
      Object.entries(view.tableFilters || {}).forEach(([key, value]) => {
        const el = document.querySelector(`[data-table-filter="${key}"]`);
        if (el) el.value = value || '';
      });
    } catch (e) {}
  }

  function setSelectValues(el, values) {
    const selected = new Set(Array.isArray(values) ? values : [values].filter(Boolean));
    Array.from(el?.options || []).forEach((o) => { o.selected = selected.has(o.value); });
  }

  function clearFilterControls() {
    if (els.searchInput) els.searchInput.value = '';
    [els.disciplineFilter, els.groupFilter, els.teacherFilter, els.controlTypeFilter, els.dateFilter, els.timeFilter, els.roomFilter]
      .forEach((el) => setSelectValues(el, []));
    if (els.emptyFieldFilter) els.emptyFieldFilter.value = '';
    if (els.dateFromFilter) els.dateFromFilter.value = '';
    if (els.dateToFilter) els.dateToFilter.value = '';
    document.querySelectorAll('[data-table-filter]').forEach((el) => { el.value = ''; });
    state.filterConflictsOnly = false;
    state.filterMissingOnly = false;
    state.qualityFilter = '';
    state.quickDateFrom = '';
    state.quickDateTo = '';
    state.problemsOnly = false;
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

  function applyFilters(skipConflictDetect = false) {
    const q = clean(els.searchInput.value).toLowerCase();
    const df = selectValues(els.disciplineFilter);
    const gf = selectValues(els.groupFilter);
    const tf = selectValues(els.teacherFilter);
    const ctf = selectValues(els.controlTypeFilter);
    const datef = selectValues(els.dateFilter);
    const timef = selectValues(els.timeFilter);
    const roomf = selectValues(els.roomFilter);
    const emptyField = clean(els.emptyFieldFilter?.value);
    const dateFrom = clean(els.dateFromFilter?.value);
    const dateTo = clean(els.dateToFilter?.value);
    const tableFilters = getTableFilters();
    const controlTypeFilterKey = ctf.join('|');
    const controlTypeFilterChanged = controlTypeFilterKey !== state.lastControlTypeFilter;
    state.filteredRows = state.rows.filter((r, i) => {
      if (state.filterConflictsOnly && !state.conflictIndices.has(i)) return false;
      if (state.filterMissingOnly && (!r.date || (!r.time && r.controlType === 'іспит'))) return false;
      if (state.qualityFilter === 'Missing date' && clean(r.date)) return false;
      if (state.qualityFilter === 'Missing time (exam)' && (clean(r.controlType) !== 'іспит' || clean(r.time))) return false;
      if (state.qualityFilter === 'Missing room (exam)' && (clean(r.controlType) !== 'іспит' || clean(r.room))) return false;
      if (state.qualityFilter === 'Missing teacher' && (r.teachers || []).length) return false;
      if (state.qualityFilter === 'Duplicates' && !isDuplicateRow(r)) return false;
      if (state.quickDateFrom && clean(r.date) < state.quickDateFrom) return false;
      if (state.quickDateTo && clean(r.date) > state.quickDateTo) return false;
      if (dateFrom && clean(r.date) < dateFrom) return false;
      if (dateTo && clean(r.date) > dateTo) return false;
      if (state.problemsOnly && !Object.values(rowProblemFlags(r)).some(Boolean)) return false;
      if (emptyField === 'teacher' && (r.teachers || []).length) return false;
      if (emptyField === 'date' && clean(r.date)) return false;
      if (emptyField === 'time' && clean(r.time)) return false;
      if (emptyField === 'room' && clean(r.room)) return false;
      if (!matchesAny(df, r.discipline)) return false;
      if (!matchesAny(gf, r.group, (v) => clean(v).toUpperCase())) return false;
      if (tf.length && !(r.teachers || []).some((t) => tf.includes(t))) return false;
      if (!matchesAny(ctf, r.controlType, (v) => clean(v).toLowerCase())) return false;
      if (!matchesAny(datef, r.date)) return false;
      if (!matchesAny(timef, r.time)) return false;
      if (!matchesAny(roomf, r.room)) return false;
      if (tableFilters.discipline && !clean(r.discipline).toLowerCase().includes(tableFilters.discipline.toLowerCase())) return false;
      if (tableFilters.group && !clean(r.group).toLowerCase().includes(tableFilters.group.toLowerCase())) return false;
      if (tableFilters.teacher1 && !clean((r.teachers || [])[0]).toLowerCase().includes(tableFilters.teacher1.toLowerCase())) return false;
      if (tableFilters.teacher2 && !clean((r.teachers || [])[1]).toLowerCase().includes(tableFilters.teacher2.toLowerCase())) return false;
      if (tableFilters.controlType && clean(r.controlType).toLowerCase() !== tableFilters.controlType.toLowerCase()) return false;
      if (tableFilters.date && clean(r.date) !== tableFilters.date) return false;
      if (tableFilters.time && clean(r.time) !== tableFilters.time) return false;
      if (tableFilters.room && !clean(r.room).toLowerCase().includes(tableFilters.room.toLowerCase())) return false;
      if (!q) return true;
      return `${r.discipline} ${r.group} ${r.teachers.join(' ')} ${r.controlType} ${r.date || ''} ${r.time || ''} ${r.room || ''}`.toLowerCase().includes(q);
    });
    
    // Auto-sort by date if Exam filter is active
    if (ctf.length === 1 && ctf[0] === 'іспит' && controlTypeFilterChanged) {
      state.sortField = 'date';
      state.sortAsc = true;
      updateSortIndicators();
    }
    state.lastControlTypeFilter = controlTypeFilterKey;
    state.groupBy = clean(els.groupBySelect?.value);
    
    if (state.sortField) applySorting();
    if (state.groupBy) {
      state.filteredRows.sort((a, b) => {
        const ga = groupLabel(a);
        const gb = groupLabel(b);
        if (ga !== gb) return ga.localeCompare(gb, 'uk');
        return `${a.date || ''} ${a.time || ''} ${a.group || ''}`.localeCompare(`${b.date || ''} ${b.time || ''} ${b.group || ''}`, 'uk');
      });
    }
    if (!skipConflictDetect) detectConflicts(false);
    renderTable(state.filteredRows);
    renderDaySummary();
    renderCalendar();
    applyColumnVisibility();
    updateProblemButton();
    saveViewState();
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
      else if (f === 'teacher2') { va = (a.teachers || [])[1] || ''; vb = (b.teachers || [])[1] || ''; }
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
    const colorDot = (type) => `<span class="w-2 h-2 rounded-full inline-block" style="background:${{'залік':'#10b981','іспит':'#3b82f6','захист':'#f59e0b','диф.залік':'#8b5cf6'}[type] || '#ccc'}"></span>`;
    el.innerHTML = `<div class="flex gap-4 flex-wrap items-center text-xs">
      ${CONTROL_OPTIONS.map((t) => `<span class="flex items-center gap-1">${colorDot(t)} ${t}: <b>${byType[t]}</b></span>`).join('')}
      <span>| Найбільше/день: <b>${maxPerDay}</b> (${busiestDay})</span>
      ${busiestTeacher ? `<span>| Найзайнятіший: <b>${busiestTeacher[0].split(' ').slice(0,2).join(' ')}</b> (${busiestTeacher[1]})</span>` : ''}
    </div>`;
  }

  function renderDaySummary() {
    if (!els.daySummaryPanel) return;
    const byDate = new Map();
    state.filteredRows.forEach((r) => {
      const date = clean(r.date) || 'Без дати';
      if (!byDate.has(date)) byDate.set(date, { total: 0, exams: 0, rooms: new Set(), problems: 0 });
      const item = byDate.get(date);
      item.total++;
      if (clean(r.controlType).toLowerCase() === 'іспит') item.exams++;
      if (clean(r.room)) item.rooms.add(clean(r.room));
      if (Object.values(rowProblemFlags(r)).some(Boolean)) item.problems++;
    });
    const rows = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0], 'uk')).slice(0, 14);
    els.daySummaryPanel.innerHTML = rows.length
      ? `<div class="flex gap-2 flex-wrap">${rows.map(([date, x]) => `<button data-summary-date="${escapeHtml(date)}" class="px-2 py-1 rounded border dark:border-gray-600 bg-white dark:bg-gray-700 text-xs">${escapeHtml(date)}: <b>${x.total}</b> / іспитів ${x.exams} / ауд. ${x.rooms.size}${x.problems ? ` / <span class="text-orange-600">${x.problems} проблем</span>` : ''}</button>`).join('')}</div>`
      : '';
  }

  function renderCalendar() {
    if (!els.calendarPanel) return;
    els.calendarPanel.classList.toggle('hidden', state.viewMode !== 'calendar');
    const table = document.querySelector('table');
    if (table) table.classList.toggle('hidden', state.viewMode === 'calendar');
    if (state.viewMode !== 'calendar') return;
    const byDate = new Map();
    state.filteredRows.forEach((r) => {
      const date = clean(r.date) || 'Без дати';
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(r);
    });
    els.calendarPanel.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">${Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0], 'uk')).map(([date, rows]) => `
      <div class="rounded border dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-700/50">
        <div class="font-bold text-sm mb-2">${escapeHtml(date)} (${rows.length})</div>
        <div class="space-y-2">${rows.sort((a, b) => clean(a.time).localeCompare(clean(b.time), 'uk')).map((r) => `<button data-detail-id="${r.id}" class="block w-full text-left rounded bg-white dark:bg-gray-800 border dark:border-gray-700 p-2 text-xs">
          <div class="font-semibold">${escapeHtml(r.time || '—')} · ${escapeHtml(r.group || '—')}</div>
          <div>${escapeHtml(r.discipline || '')}</div>
          <div class="text-gray-500">${escapeHtml((r.teachers || []).join('; '))} ${r.room ? `· ${escapeHtml(r.room)}` : ''}</div>
        </button>`).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function applyColumnVisibility() {
    document.querySelectorAll('[data-col-toggle]').forEach((cb) => {
      cb.checked = !state.hiddenColumns.has(cb.dataset.colToggle);
    });
    document.querySelectorAll('[data-col-key]').forEach((el) => {
      el.classList.toggle('hidden', state.hiddenColumns.has(el.dataset.colKey));
    });
  }

  function updateProblemButton() {
    els.problemFilterBtn?.classList.toggle('bg-orange-100', state.problemsOnly);
    els.problemFilterBtn?.classList.toggle('text-orange-700', state.problemsOnly);
  }

  function renderRowDetail(row) {
    if (!els.rowDetailPanel || !row) return;
    const flags = rowProblemFlags(row);
    const idx = state.rows.findIndex((x) => String(x.id) === String(row.id));
    const warnings = (state.warnings || []).filter((w) => w.index === idx).map((w) => w.message);
    els.rowDetailPanel.classList.remove('hidden');
    els.rowDetailPanel.innerHTML = `<div class="flex items-start justify-between gap-2">
      <div>
        <div class="font-bold">${escapeHtml(row.discipline || 'Без предмета')}</div>
        <div class="text-gray-500">${escapeHtml(row.group || 'Без групи')} · ${escapeHtml(row.controlType || '')}</div>
      </div>
      <button id="closeRowDetailBtn" class="px-2 py-1 rounded border dark:border-gray-600 text-xs">Закрити</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
      <div><b>Викладачі:</b> ${escapeHtml((row.teachers || []).join('; ') || '—')}</div>
      <div><b>Дата/час:</b> ${escapeHtml(row.date || '—')} ${escapeHtml(row.time || '')}</div>
      <div><b>Аудиторія:</b> ${escapeHtml(row.room || '—')}</div>
    </div>
    <div class="mt-3 text-xs">${Object.entries(flags).filter(([, v]) => v).map(([k]) => `<span class="inline-block mr-1 px-2 py-1 rounded bg-orange-100 text-orange-700">${k}</span>`).join('') || 'Проблем не позначено'}</div>
    ${warnings.length ? `<div class="mt-2 text-xs text-orange-700">${warnings.map(escapeHtml).join('<br>')}</div>` : ''}`;
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
    const inputs = els.tableBody.querySelectorAll('[data-f][data-id]');
    const rowMap = new Map(state.rows.map(r => [String(r.id), r]));
    const pendingTeachers = new Map();
    inputs.forEach(inp => {
      const id = String(inp.dataset.id);
      const field = inp.dataset.f;
      const row = rowMap.get(id);
      if (!row) return;
      if (field === 'teachers') row.teachers = splitTeachers(inp.value);
      else if (field === 'teachers1' || field === 'teachers2') {
        if (!pendingTeachers.has(id)) pendingTeachers.set(id, Array.isArray(row.teachers) ? row.teachers.slice() : []);
        pendingTeachers.get(id)[field === 'teachers1' ? 0 : 1] = clean(inp.value);
      }
      else if (field === 'discipline') row.discipline = normalizeDiscipline(inp.value);
      else if (field === 'controlType') row.controlType = clean(inp.value);
      else row[field] = clean(inp.value);
    });
    pendingTeachers.forEach((teachers, id) => {
      const row = rowMap.get(id);
      if (row) row.teachers = teachers.map(clean).filter(Boolean);
    });
    // Sync checkboxes
    const cbs = els.tableBody.querySelectorAll('input[data-act="select-row"][data-id]');
    cbs.forEach(cb => {
      const id = String(cb.dataset.id);
      if (cb.checked) state.selectedRowKeys.add(id);
      else state.selectedRowKeys.delete(id);
    });
  }

  // syncFromGrid handled above in turn history

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
    applyFilters();
    showError('');
    setStatus('Дати проставлено автоматично');
  }

  function detectConflicts(withStatus = true) {
    if (!conflictsWorker) {
      conflictsWorker = new Worker('/js/workers/session-conflicts-worker.js?v=20260503-7');
      conflictsWorker.onmessage = (evt) => {
        const data = evt.data || {};
        if (data.requestId !== conflictRequestId) return;
        const rowIds = data.rowIds || [];
        const globalIndexById = new Map(state.rows.map((r, i) => [String(r.id), i]));
        const toGlobalIndexSet = (indices) => new Set((indices || [])
          .map((idx) => globalIndexById.get(String(rowIds[idx])))
          .filter((idx) => Number.isInteger(idx)));
        state.conflictIndices = toGlobalIndexSet(data.conflictIndices);
        state.overloadIndices = toGlobalIndexSet(data.overloadIndices);
        state.warningIndices = toGlobalIndexSet(data.warningIndices);
        state.warnings = (data.warnings || []).map((w) => ({
          ...w,
          index: globalIndexById.get(String(rowIds[w.index]))
        })).filter((w) => Number.isInteger(w.index));
        state.quality = data.quality || {};
        if (els.conflictSummary) els.conflictSummary.innerHTML = `Конфліктів: <b>${state.conflictIndices.size}</b>${state.overloadIndices.size ? ` | Перевантажень: <b class="text-amber-600">${state.overloadIndices.size}</b>` : ''}${state.warningIndices.size ? ` | Попереджень: <b class="text-orange-600">${state.warningIndices.size}</b>` : ''}`;
        renderQualityPanel();
        if (state.filterConflictsOnly || state.problemsOnly) {
          applyFilters(true);
          return;
        }
        renderTable(state.filteredRows);
        renderDaySummary();
        renderCalendar();
        applyColumnVisibility();
      };
    }
    conflictRequestId += 1;
    conflictsWorker.postMessage({
      rows: state.filteredRows,
      rowIds: state.filteredRows.map((r) => String(r.id)),
      requestId: conflictRequestId,
      mode: clean(els.conflictMode?.value || 'soft')
    });
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

  function duplicateGroups() {
    const map = new Map();
    state.rows.forEach((r) => {
      const key = duplicateKey(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries()).filter(([, rows]) => rows.length > 1);
  }

  function showDuplicateTools() {
    const groups = duplicateGroups();
    els.suggestionsBox.classList.remove('hidden');
    if (!groups.length) {
      els.suggestionsBox.textContent = 'Дублікатів не знайдено.';
      return;
    }
    els.suggestionsBox.innerHTML = `<div class="font-bold mb-2">Дублікати</div>${groups.slice(0, 30).map(([key, rows], i) => `
      <div class="mb-2 p-2 rounded bg-white dark:bg-gray-700 border dark:border-gray-600">
        <div class="text-sm font-semibold">${escapeHtml(rows[0].discipline)} · ${escapeHtml(rows[0].group)} · ${escapeHtml(rows[0].controlType)} (${rows.length})</div>
        <div class="flex gap-2 mt-2">
          <button data-dup-act="merge" data-dup-key="${escapeHtml(key)}" class="px-2 py-1 rounded bg-emerald-600 text-white text-xs">Об'єднати</button>
          <button data-dup-act="delete" data-dup-key="${escapeHtml(key)}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити зайві</button>
        </div>
      </div>`).join('')}`;
  }

  function mergeDuplicateGroup(key, mergeFields) {
    const rows = state.rows.filter((r) => duplicateKey(r) === key);
    if (rows.length < 2) return;
    pushUndo();
    const base = rows[0];
    if (mergeFields) {
      rows.slice(1).forEach((r) => {
        base.teachers = Array.from(new Set([...(base.teachers || []), ...(r.teachers || [])].filter(Boolean)));
        if (!base.date && r.date) base.date = r.date;
        if (!base.time && r.time) base.time = r.time;
        if (!base.room && r.room) base.room = r.room;
      });
    }
    const keepId = String(base.id);
    state.rows = state.rows.filter((r) => duplicateKey(r) !== key || String(r.id) === keepId);
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
    showDuplicateTools();
  }

  function normalizeTeacherName(name) {
    const parts = clean(name).replace(/\./g, ' ').split(' ').filter(Boolean);
    if (!parts.length) return '';
    return parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toUpperCase()).join(' ');
  }

  function normalizeTeachersAction() {
    syncFromGrid();
    pushUndo();
    state.rows.forEach((r) => {
      r.teachers = Array.from(new Set((r.teachers || []).map(normalizeTeacherName).filter(Boolean)));
    });
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
    setStatus('Викладачів нормалізовано');
  }

  async function compareWithApi() {
    const term = resolveSessionTerm();
    if (!term) return showError('Оберіть або введіть назву сесії для порівняння');
    const res = await fetch(`/api/session?term=${encodeURIComponent(term)}`);
    const data = await res.json();
    const apiRows = (data.sessions || []).flatMap(s => s.items || []).map((item) => ({
      discipline: item.discipline || '',
      group: (item.groups && item.groups[0]) || item.groupHeading || '',
      teachers: splitTeachers(item.teacher || ''),
      controlType: CONTROL_OPTIONS.includes(clean(item.controlType).toLowerCase()) ? clean(item.controlType).toLowerCase() : 'залік',
      date: item.date || '',
      time: item.time || '',
      room: item.room || ''
    }));
    const localKeys = new Set(state.rows.map(duplicateKey));
    const apiKeys = new Set(apiRows.map(duplicateKey));
    const onlyLocal = state.rows.filter((r) => !apiKeys.has(duplicateKey(r)));
    const onlyApi = apiRows.filter((r) => !localKeys.has(duplicateKey(r)));
    const changed = state.rows.filter((r) => {
      const match = apiRows.find((x) => duplicateKey(x) === duplicateKey(r));
      return match && `${clean(match.date)} ${clean(match.time)} ${clean(match.room)}` !== `${clean(r.date)} ${clean(r.time)} ${clean(r.room)}`;
    });
    els.suggestionsBox.classList.remove('hidden');
    els.suggestionsBox.innerHTML = `<div class="font-bold mb-2">Порівняння з API: ${escapeHtml(term)}</div>
      <div class="flex gap-2 flex-wrap text-sm">
        <span class="px-2 py-1 rounded bg-emerald-100 text-emerald-700">Локально нові: ${onlyLocal.length}</span>
        <span class="px-2 py-1 rounded bg-amber-100 text-amber-700">Є тільки в API: ${onlyApi.length}</span>
        <span class="px-2 py-1 rounded bg-blue-100 text-blue-700">Змінені слот/аудиторія: ${changed.length}</span>
      </div>`;
  }

  function getSnapshots() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '[]'); } catch (e) { return []; }
  }

  function renderSnapshotSelect() {
    if (!els.snapshotSelect) return;
    const snapshots = getSnapshots();
    els.snapshotSelect.innerHTML = '<option value="">Знімки версій</option>';
    snapshots.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${new Date(s.ts).toLocaleString('uk-UA')} (${s.rows?.length || 0})`;
      els.snapshotSelect.appendChild(o);
    });
  }

  function saveSnapshot() {
    syncFromGrid();
    const snapshots = getSnapshots();
    snapshots.unshift({ id: generateId(), ts: new Date().toISOString(), rows: state.rows });
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, 12)));
    renderSnapshotSelect();
    setStatus('Знімок версії збережено');
  }

  function restoreSnapshot() {
    const id = clean(els.snapshotSelect?.value);
    const snapshot = getSnapshots().find((s) => s.id === id);
    if (!snapshot) return;
    pushUndo();
    state.rows = (snapshot.rows || []).map((r) => ({ ...r, id: r.id || generateId(), teachers: Array.isArray(r.teachers) ? r.teachers : splitTeachers(r.teachers || '') }));
    renderFilters(state.rows);
    applyFilters();
    saveDraftDebounced();
    setStatus('Знімок версії відновлено');
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
      if (els.draftInfo) {
        const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        els.draftInfo.innerHTML = `<span class="text-green-600 dark:text-green-400">●</span> Автозбереження: ${time}`;
      }
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
        state.rows = draft.rows.map((r) => ({ 
          ...r, 
          id: r.id || generateId(),
          teachers: Array.isArray(r.teachers) ? r.teachers : splitTeachers(r.teachers || '') 
        }));
        renderFilters(state.rows);
        restoreViewState();
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
    state.rows = dedupeRows(state.rows.concat(rawRows), true).filter((r) => r.discipline && r.group);
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
    pushUndo();
    state.rows.push({ 
      id: generateId(),
      discipline: 'Новий предмет', 
      group: '', 
      teachers: [], 
      controlType: 'залік', 
      date: '', 
      time: '', 
      room: '' 
    });
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
      
      state.rows = dedupeRows(state.rows.concat(parsed), false);
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
    applyFilters();
    if (!state.filteredRows.length) {
      if (!confirm('У таблиці немає записів. Ви впевнені, що хочете завантажити ПОРОЖНЮ сесію в API? Це може призвести до очищення даних на сервері.')) return;
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

  async function clearApiSession(isPurge = false) {
    showError('');
    const term = resolveSessionTerm();
    if (!term) return showError('Оберіть назву сесії для видалення');
    
    const action = isPurge ? 'purgeTerm' : 'deleteTerm';
    const actionText = isPurge ? 'ВИДАЛИТИ НАЗАВЖДИ' : 'перемістити у кошик';
    
    if (!confirm(`Ви впевнені, що хочете ${actionText} сесію "${term}" в API?`)) return;

    const password = clean(els.adminPassword.value);
    if (!password) return showError('Введіть ADMIN_PASSWORD');

    const payload = {
      password,
      actor: clean(els.adminActor.value) || 'session-constructor',
      action: action,
      term: term,
      studyForm: clean(els.studyForm.value)
    };

    try {
      setStatus(`${isPurge ? 'Очищення' : 'Видалення'} "${term}" з API...`);
      const res = await fetch(API_SESSION, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      });
      const raw = await res.text();
      let json = null; try { json = JSON.parse(raw); } catch(e) {}
      if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
      setStatus(`Успішно: сесія "${term}" ${isPurge ? 'видалена назавжди' : 'переміщена в кошик'}.`);
      loadSessionTerms();
    } catch(err) {
      showError(`Помилка API (${action}): ` + err.message);
    }
  }
  async function validateOnly() {
    syncFromGrid();
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
    const rows = getScopedRows();
    const data = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю', 'Дата', 'Час', 'Аудиторія']];
    rows.forEach((r, i) => data.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.time || '', r.room || '']));
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Session');
    XLSX.writeFile(wb, 'session_constructor.xlsx');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function getScopedRows() {
    const scope = clean(els.exportScope?.value) || 'filtered';
    if (scope === 'all') return state.rows.slice();
    if (scope === 'selected') return state.rows.filter((r) => state.selectedRowKeys.has(rowKey(r)));
    return state.filteredRows.slice();
  }
  function exportWord() {
    syncFromGrid();
    const rows = getScopedRows();
    if (!rows.length) return showError('Немає даних для експорту у Word');
    const grouped = new Map();
    rows.forEach((r) => {
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
    const rows = getScopedRows();
    const lines = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю', 'Дата', 'Час', 'Аудиторія'].join('\t')];
    rows.forEach((r, i) => lines.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.time || '', r.room || ''].join('\t')));
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
  document.getElementById('clearAllBtn')?.addEventListener('click', () => els.clearDraftBtn?.click());
  document.getElementById('clearApiBtn')?.addEventListener('click', () => clearApiSession(false).catch((e) => showError(e.message || String(e))));
  document.getElementById('purgeApiBtn')?.addEventListener('click', () => clearApiSession(true).catch((e) => showError(e.message || String(e))));
  document.getElementById('listTermsBtn')?.addEventListener('click', async () => {
     try {
       const res = await fetch('/api/session');
       const data = await res.json();
       const list = (data.sessions || []).map(s => `${s.term} (${(s.items||[]).length})`).join('\n');
       alert('Список сесій в API:\n' + (list || 'Порожньо'));
     } catch(e) { showError(e.message); }
  });
  els.sessionTermSelect?.addEventListener('change', () => {
     if (els.sessionTermSelect.value) els.sessionTerm.value = els.sessionTermSelect.value;
  });
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
  els.suggestionsBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dup-act]');
    if (!btn) return;
    mergeDuplicateGroup(btn.dataset.dupKey, btn.dataset.dupAct === 'merge');
  });
  els.validateOnlyBtn?.addEventListener('click', () => validateOnly().catch((e) => showError(e.message || String(e))));
  els.applyBulkBtn.addEventListener('click', applyBulkToSelected);
  els.searchInput.addEventListener('input', applyFilters);
  els.disciplineFilter?.addEventListener('change', applyFilters);
  els.groupFilter?.addEventListener('change', applyFilters);
  els.teacherFilter?.addEventListener('change', applyFilters);
  els.controlTypeFilter?.addEventListener('change', applyFilters);
  els.dateFilter?.addEventListener('change', applyFilters);
  els.timeFilter?.addEventListener('change', applyFilters);
  els.roomFilter?.addEventListener('change', applyFilters);
  els.emptyFieldFilter?.addEventListener('change', applyFilters);
  els.groupBySelect?.addEventListener('change', applyFilters);
  els.dateFromFilter?.addEventListener('change', applyFilters);
  els.dateToFilter?.addEventListener('change', applyFilters);
  els.exportScope?.addEventListener('change', saveViewState);
  els.problemFilterBtn?.addEventListener('click', () => {
    state.problemsOnly = !state.problemsOnly;
    applyFilters();
  });
  els.selectFilteredBtn?.addEventListener('click', () => {
    syncFromGrid();
    state.filteredRows.forEach((r) => state.selectedRowKeys.add(rowKey(r)));
    renderTable(state.filteredRows);
    applyColumnVisibility();
    setStatus(`Виділено ${state.filteredRows.length} відфільтрованих рядків`);
  });
  els.toggleToolsBtn?.addEventListener('click', () => {
    els.advancedToolsPanel?.classList.toggle('hidden');
  });
  els.tableViewBtn?.addEventListener('click', () => {
    state.viewMode = 'table';
    applyFilters();
  });
  els.calendarViewBtn?.addEventListener('click', () => {
    state.viewMode = 'calendar';
    applyFilters();
  });
  els.normalizeTeachersBtn?.addEventListener('click', normalizeTeachersAction);
  els.compareApiBtn?.addEventListener('click', () => compareWithApi().catch((e) => showError(e.message || String(e))));
  els.snapshotBtn?.addEventListener('click', saveSnapshot);
  els.restoreSnapshotBtn?.addEventListener('click', restoreSnapshot);
  els.columnToggles?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-col-toggle]');
    if (!cb) return;
    if (cb.checked) state.hiddenColumns.delete(cb.dataset.colToggle);
    else state.hiddenColumns.add(cb.dataset.colToggle);
    applyColumnVisibility();
    saveViewState();
  });
  document.querySelectorAll('[data-table-filter]').forEach((el) => {
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, applyFilters);
  });
  els.presetExamsBtn?.addEventListener('click', () => {
    clearFilterControls();
    const el = document.querySelector('[data-table-filter="controlType"]');
    if (el) el.value = 'іспит';
    applyFilters();
  });
  els.presetTodayBtn?.addEventListener('click', () => {
    clearFilterControls();
    const el = document.querySelector('[data-table-filter="date"]');
    if (el) el.value = todayIso();
    applyFilters();
  });
  els.presetWeekBtn?.addEventListener('click', () => {
    clearFilterControls();
    state.quickDateFrom = todayIso();
    state.quickDateTo = addDaysIso(todayIso(), 6);
    applyFilters();
  });
  els.presetMissingRoomBtn?.addEventListener('click', () => {
    clearFilterControls();
    if (els.emptyFieldFilter) els.emptyFieldFilter.value = 'room';
    applyFilters();
  });
  els.presetTeacherConflictsBtn?.addEventListener('click', () => {
    clearFilterControls();
    state.filterConflictsOnly = true;
    updateFilterBtns();
    detectConflicts(false);
    applyFilters();
  });
  els.clearFiltersBtn?.addEventListener('click', () => {
    clearFilterControls();
    els.filterConflictsBtn?.classList.remove('bg-rose-100', 'dark:bg-rose-900', 'text-rose-700');
    els.filterMissingBtn?.classList.remove('bg-amber-100', 'dark:bg-amber-900', 'text-amber-700');
    updateProblemButton();
    applyFilters();
  });

  els.tableBody.addEventListener('click', (e) => {
    const detailTarget = e.target.closest('tr[data-id]');
    if (detailTarget && !e.target.closest('button, input, select')) {
      renderRowDetail(state.rows.find((r) => String(r.id) === String(detailTarget.dataset.id)));
      return;
    }
    const btn = e.target.closest('button[data-act="del"]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    syncFromGrid();
    pushUndo();
    const idToDel = String(id);
    state.rows = state.rows.filter(r => String(r.id) !== idToDel);
    applyFilters();
    saveDraftDebounced();
  });

  els.daySummaryPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-summary-date]');
    if (!btn) return;
    const el = document.querySelector('[data-table-filter="date"]');
    if (el) el.value = btn.dataset.summaryDate === 'Без дати' ? '' : btn.dataset.summaryDate;
    if (btn.dataset.summaryDate === 'Без дати' && els.emptyFieldFilter) els.emptyFieldFilter.value = 'date';
    applyFilters();
  });

  els.calendarPanel?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-detail-id]');
    if (!btn) return;
    renderRowDetail(state.rows.find((r) => String(r.id) === String(btn.dataset.detailId)));
  });

  els.rowDetailPanel?.addEventListener('click', (e) => {
    if (e.target.closest('#closeRowDetailBtn')) els.rowDetailPanel.classList.add('hidden');
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
        const id = inp.dataset.id;
        const row = state.rows.find(x => x.id === id);
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
  let draggedId = null;
  els.tableBody.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.id === undefined) return;
    draggedId = tr.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedId);
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
    const targetId = tr.dataset.id;
    if (draggedId === targetId) return;
    
    syncFromGrid();
    pushUndo();
    
    const dragIdx = state.rows.findIndex(r => r.id === draggedId);
    const targetIdx = state.rows.findIndex(r => r.id === targetId);
    
    if (dragIdx !== -1 && targetIdx !== -1) {
      const item = state.rows.splice(dragIdx, 1)[0];
      state.rows.splice(targetIdx, 0, item);
    }
    
    applyFilters();
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
    localStorage.removeItem(VIEW_STATE_KEY);
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
    state.qualityFilter = state.qualityFilter === key ? '' : key;
    if (key === 'Duplicates') showDuplicateTools();
    applyFilters();
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
    saveDraft();
  });

  if (els.groupFilter) renderSelect(els.groupFilter, [], 'Усі групи');
  if (els.teacherFilter) renderSelect(els.teacherFilter, [], 'Усі викладачі');
  if (els.conflictSummary) els.conflictSummary.textContent = 'Конфліктів: 0';
  setProgress(0, 1, 'Готово');
  setMode('basic');
  loadSessionTerms();
  renderSnapshotSelect();

  // Restore draft FIRST, then init controls (so API failure doesn't lose data)
  restoreDraft();
  initControls()
    .then(() => {
      // Re-apply draft on top of loaded controls if rows exist
      if (!state.rows.length) restoreDraft();
      renderFilters(state.rows);
      restoreViewState();
      applyFilters();
    })
    .catch((e) => {
      showError('API недоступний, але чернетка відновлена: ' + (e.message || String(e)));
    });
})();
