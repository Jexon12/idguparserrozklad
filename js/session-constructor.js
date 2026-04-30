(function () {
  const API_PROXY = '/api/';
  const API_SESSION = '/api/session';
  const VUZ_ID = 11927;
  const CONTROL_OPTIONS = ['залік', 'іспит', 'захист'];

  const els = {
    adminPassword: document.getElementById('adminPassword'),
    adminActor: document.getElementById('adminActor'),
    sessionTermSelect: document.getElementById('sessionTermSelect'),
    sessionTerm: document.getElementById('sessionTerm'),
    studyForm: document.getElementById('studyForm'),
    docxFiles: document.getElementById('docxFiles'),
    facultySelect: document.getElementById('facultySelect'),
    semesterPreset: document.getElementById('semesterPreset'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
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
    tableBody: document.getElementById('tableBody')
  };

  const state = {
    faculties: [],
    courses: [],
    groups: [],
    rows: [],
    filteredRows: [],
    conflictIndices: new Set()
  };

  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizeDiscipline = (v) => clean(v).replace(/^[\d\.\-\)\(]+\s*/g, '').replace(/[;:,]+$/g, '').trim();
  const splitTeachers = (v) => Array.from(new Set(clean(v).replace(/\s*(,|\/|\|)\s*/g, '; ').replace(/\s+та\s+/giu, '; ').split(';').map(clean).filter(Boolean)));

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
    const groups = Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b, 'uk'));
    const teachers = Array.from(new Set(rows.flatMap((r) => r.teachers))).sort((a, b) => a.localeCompare(b, 'uk'));
    els.groupFilter.innerHTML = '<option value="">Усі групи</option>';
    groups.forEach((g) => { const o = document.createElement('option'); o.value = g; o.textContent = g; els.groupFilter.appendChild(o); });
    els.teacherFilter.innerHTML = '<option value="">Усі викладачі</option>';
    teachers.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; els.teacherFilter.appendChild(o); });
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
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      const currentControl = CONTROL_OPTIONS.includes(clean(r.controlType).toLowerCase()) ? clean(r.controlType).toLowerCase() : 'залік';
      tr.innerHTML = `
        <td class="px-2 py-2">${i + 1}</td>
        <td class="px-2 py-2"><input data-f="discipline" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.discipline || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="group" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.group || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="teachers" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.teachers || []).join('; ').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><select data-f="controlType" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700">${CONTROL_OPTIONS.map((o) => `<option value="${o}" ${currentControl === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td class="px-2 py-2"><input data-f="date" data-i="${i}" type="date" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.date || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="time" data-i="${i}" type="time" class="w-full rounded border p-1 bg-white dark:bg-gray-700 ${currentControl === 'іспит' ? '' : 'hidden'}" value="${(r.time || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><input data-f="room" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.room || '').replace(/"/g, '&quot;')}"></td>
        <td class="px-2 py-2"><button data-act="del" data-i="${i}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити</button></td>
      `;
      if (state.conflictIndices.has(i)) tr.classList.add('bg-red-50', 'dark:bg-red-900/20');
      els.tableBody.appendChild(tr);
    });
    els.countLabel.textContent = String(rows.length);
    els.uploadBtn.disabled = false;
    els.uploadBtn.classList.remove('opacity-60', 'cursor-not-allowed');
  }

  function applyFilters() {
    const q = clean(els.searchInput.value).toLowerCase();
    const gf = clean(els.groupFilter.value);
    const tf = clean(els.teacherFilter.value);
    state.filteredRows = state.rows.filter((r) => {
      if (gf && r.group !== gf) return false;
      if (tf && !r.teachers.includes(tf)) return false;
      if (!q) return true;
      return `${r.discipline} ${r.group} ${r.teachers.join(' ')} ${r.controlType} ${r.date || ''} ${r.time || ''}`.toLowerCase().includes(q);
    });
    detectConflicts(false);
    renderTable(state.filteredRows);
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
      if (rm) r.room = clean(rm.value);
      if (r.controlType !== 'іспит') r.time = '';
    });
    state.filteredRows = list;
  }

  function mergeFilteredBack() {
    const old = new Set(state.filteredRows.map((r) => `${r.discipline}__${r.group}`));
    const rest = state.rows.filter((r) => !old.has(`${r.discipline}__${r.group}`));
    state.rows = dedupeRows(rest.concat(state.filteredRows));
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
    state.conflictIndices = new Set();
    const byGroupSlot = new Map();
    const byTeacherSlot = new Map();
    const byRoomSlot = new Map();
    const byGroupExamDay = new Map();
    state.filteredRows.forEach((r, idx) => {
      const date = clean(r.date);
      const time = clean(r.time);
      const room = clean(r.room).replace(/\s+/g, '').toLowerCase();
      const isExam = clean(r.controlType).toLowerCase() === 'іспит';
      if (!date) return;

      if (isExam && time) {
        const gk = `${clean(r.group).toLowerCase()}__${date}__${time}`;
        if (!byGroupSlot.has(gk)) byGroupSlot.set(gk, []);
        byGroupSlot.get(gk).push(idx);
        (r.teachers || []).forEach((t) => {
          const tk = `${clean(t).toLowerCase()}__${date}__${time}`;
          if (!byTeacherSlot.has(tk)) byTeacherSlot.set(tk, []);
          byTeacherSlot.get(tk).push(idx);
        });
        if (room) {
          const rk = `${room}__${date}__${time}`;
          if (!byRoomSlot.has(rk)) byRoomSlot.set(rk, []);
          byRoomSlot.get(rk).push(idx);
        }
      }

      if (isExam) {
        const key = clean(r.group).toLowerCase();
        if (!byGroupExamDay.has(key)) byGroupExamDay.set(key, []);
        byGroupExamDay.get(key).push({ idx, date });
      }
    });

    byGroupSlot.forEach((arr) => { if (arr.length > 1) arr.forEach((i) => state.conflictIndices.add(i)); });
    byTeacherSlot.forEach((arr) => { if (arr.length > 1) arr.forEach((i) => state.conflictIndices.add(i)); });
    byRoomSlot.forEach((arr) => { if (arr.length > 1) arr.forEach((i) => state.conflictIndices.add(i)); });

    // Optional hard rule: for one group, exams should have >= 1 free day between them.
    byGroupExamDay.forEach((arr) => {
      const parsed = arr.map((x) => ({ ...x, ts: new Date(`${x.date}T00:00:00`).getTime() })).filter((x) => !Number.isNaN(x.ts)).sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < parsed.length; i++) {
        const daysDiff = Math.round((parsed[i].ts - parsed[i - 1].ts) / (24 * 3600 * 1000));
        if (daysDiff <= 1) {
          state.conflictIndices.add(parsed[i - 1].idx);
          state.conflictIndices.add(parsed[i].idx);
        }
      }
    });

    if (els.conflictSummary) els.conflictSummary.textContent = `Конфліктів: ${state.conflictIndices.size}`;
    if (withStatus) {
      if (state.conflictIndices.size) setStatus(`Знайдено конфлікти: ${state.conflictIndices.size}`, true);
      else setStatus('Конфліктів не знайдено');
    }
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
    const selectedForm = forms.find((x) => clean(x.Value).toLowerCase() === clean(els.studyForm.value).toLowerCase()) || forms[0];

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

    state.rows = dedupeRows(rawRows).filter((r) => r.discipline && r.group);
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
    state.rows.unshift({ discipline: 'Новий предмет', group: '', teachers: [], controlType: 'залік', date: '', time: '', room: '' });
    renderFilters(state.rows);
    applyFilters();
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
          time: r.controlType === 'іспит' ? (r.time || '') : '',
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

  function exportExcel() {
    syncFromGrid();
    const data = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю', 'Дата', 'Час', 'Аудиторія']];
    state.filteredRows.forEach((r, i) => data.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.controlType === 'іспит' ? (r.time || '') : '', r.room || '']));
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
      list.forEach((r, i) => { body += `<tr><td>${i + 1}</td><td>${escapeHtml(r.discipline)}</td><td>${escapeHtml(r.teachers.join('; '))}</td><td>${escapeHtml(r.controlType || '')}</td><td>${escapeHtml(r.date || '')}</td><td>${escapeHtml(r.controlType === 'іспит' ? (r.time || '') : '')}</td><td>${escapeHtml(r.room || '')}</td></tr>`; });
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
    state.filteredRows.forEach((r, i) => lines.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '', r.date || '', r.controlType === 'іспит' ? (r.time || '') : '', r.room || ''].join('\t')));
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
      const selectedForm = forms.find((x) => clean(x.Value).toLowerCase() === clean(els.studyForm.value).toLowerCase()) || forms[0];
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

  els.parseBtn.addEventListener('click', () => buildFromSchedule().catch((e) => showError(e.message || String(e))));
  els.normalizeBtn.addEventListener('click', normalizeAction);
  els.addRowBtn.addEventListener('click', addCustomRow);
  els.uploadBtn.addEventListener('click', () => uploadToApi().catch((e) => showError(e.message || String(e))));
  els.excelBtn.addEventListener('click', exportExcel);
  els.wordBtn.addEventListener('click', exportWord);
  els.copyBtn.addEventListener('click', () => copyTable().catch((e) => showError(e.message || String(e))));
  els.autoPlanBtn.addEventListener('click', autoPlanDates);
  els.conflictsBtn.addEventListener('click', () => { syncFromGrid(); detectConflicts(true); renderTable(state.filteredRows); });
  els.suggestionsBtn.addEventListener('click', buildSuggestions);
  els.searchInput.addEventListener('input', applyFilters);
  els.groupFilter.addEventListener('change', applyFilters);
  els.teacherFilter.addEventListener('change', applyFilters);

  els.tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act="del"]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (Number.isNaN(i)) return;
    syncFromGrid();
    state.filteredRows.splice(i, 1);
    mergeFilteredBack();
    renderFilters(state.rows);
    applyFilters();
  });

  els.tableBody.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-f="controlType"]');
    if (!sel) return;
    const i = sel.dataset.i;
    const tm = document.querySelector(`input[data-f="time"][data-i="${i}"]`);
    if (!tm) return;
    const isExam = clean(sel.value) === 'іспит';
    tm.classList.toggle('hidden', !isExam);
    if (!isExam) tm.value = '';
    syncFromGrid();
    detectConflicts(false);
    renderTable(state.filteredRows);
  });

  let liveTimer = null;
  const triggerLiveChecks = () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      syncFromGrid();
      detectConflicts(false);
      renderTable(state.filteredRows);
    }, 120);
  };
  els.tableBody.addEventListener('input', triggerLiveChecks);

  renderSelect(els.groupFilter, [], 'Усі групи');
  renderSelect(els.teacherFilter, [], 'Усі викладачі');
  if (els.conflictSummary) els.conflictSummary.textContent = 'Конфліктів: 0';
  setProgress(0, 1, 'Готово');
  loadSessionTerms();
  initControls().catch((e) => showError(e.message || String(e)));
})();
