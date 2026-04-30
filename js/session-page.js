(function () {
  const state = { items: [], filtered: [], conflicts: [] };

  const els = {
    term: document.getElementById('filterTerm'),
    studyForm: document.getElementById('filterStudyForm'),
    group: document.getElementById('filterGroup'),
    teacher: document.getElementById('filterTeacher'),
    controlType: document.getElementById('filterControlType'),
    discipline: document.getElementById('filterDiscipline'),
    date: document.getElementById('filterDate'),
    reset: document.getElementById('resetFilters'),
    exportBtn: document.getElementById('exportFiltered'),
    tbody: document.getElementById('sessionTableBody'),
    count: document.getElementById('resultCount'),
    source: document.getElementById('sourceInfo'),
    chips: document.getElementById('quickGroupChips'),
    statTotal: document.getElementById('statTotal'),
    statExams: document.getElementById('statExams'),
    statZaliks: document.getElementById('statZaliks'),
    statTeachers: document.getElementById('statTeachers'),
    statGroups: document.getElementById('statGroups'),
    statConflicts: document.getElementById('statConflicts')
  };

  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const norm = (v) => clean(v).toLowerCase();
  const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
  const normRoom = (v) => clean(v).replace(/\s+/g, '').toLowerCase();

  const parseSessionDate = (dateValue) => {
    const parts = String(dateValue || '').split('.');
    if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!day || !month) return Number.MAX_SAFE_INTEGER;
    const year = month <= 2 ? 2026 : 2025;
    return new Date(year, month - 1, day).getTime();
  };

  const extractTeacherNames = (value) => {
    const raw = clean(value);
    if (!raw) return [];
    return uniqSorted(raw
      .replace(/\s*(,|\/|\|)\s*/g, '; ')
      .replace(/\s+та\s+/giu, '; ')
      .split(';')
      .map(clean)
      .filter(Boolean)
      .map((s) => s.replace(/([А-ЯІЇЄҐA-Z])\s*\.\s*([А-ЯІЇЄҐA-Z])\.?/gu, '$1.$2.')));
  };

  const parseGroupsFromHeading = (heading) => {
    const raw = clean(heading);
    if (!raw) return [];
    const out = [];
    const re = /(\d{1,3})\s*([\p{L}])?/gu;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const g = clean(`${m[1]}${m[2] || ''}`.toLowerCase());
      if (g && !out.includes(g)) out.push(g);
    }
    return out;
  };

  function findConflicts(items) {
    const out = [];
    const add = (type, key, list) => { if (list.length > 1) out.push({ type, key, count: list.length }); };

    const byGroup = new Map();
    const byTeacher = new Map();
    const byRoom = new Map();

    items.forEach((it) => {
      const type = norm(it.controlType);
      if (type !== 'іспит') return;
      const d = clean(it.date);
      const t = clean(it.time);
      if (!d || !t) return;

      (it.groups || []).forEach((g) => {
        const key = `${norm(g)}__${d}__${t}`;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key).push(it);
      });

      (it.teacherNames || []).forEach((teacher) => {
        const key = `${norm(teacher)}__${d}__${t}`;
        if (!byTeacher.has(key)) byTeacher.set(key, []);
        byTeacher.get(key).push(it);
      });

      const room = normRoom(it.room);
      if (room) {
        const key = `${room}__${d}__${t}`;
        if (!byRoom.has(key)) byRoom.set(key, []);
        byRoom.get(key).push(it);
      }
    });

    byGroup.forEach((list, key) => add('group_exam_overlap', key, list));
    byTeacher.forEach((list, key) => add('teacher_exam_overlap', key, list));
    byRoom.forEach((list, key) => add('room_exam_overlap', key, list));
    return out;
  }

  function fillSelect(el, values, firstLabel, withFirst = true) {
    el.innerHTML = '';
    if (withFirst) {
      const first = document.createElement('option');
      first.value = '';
      first.textContent = firstLabel;
      el.appendChild(first);
    }
    values.forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
  }

  function buildChips(groups) {
    els.chips.innerHTML = '';
    groups.slice(0, 30).forEach((g) => {
      const btn = document.createElement('button');
      btn.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200';
      btn.textContent = g;
      btn.addEventListener('click', () => {
        els.group.value = g;
        applyFilters();
      });
      els.chips.appendChild(btn);
    });
  }

  function renderStats() {
    const items = state.filtered;
    const teachers = uniqSorted(items.flatMap((i) => i.teacherNames || []));
    const groups = uniqSorted(items.flatMap((i) => i.groups || []));
    const exams = items.filter((i) => norm(i.controlType) === 'іспит').length;
    const zaliks = items.filter((i) => norm(i.controlType) === 'залік').length;

    els.statTotal.textContent = String(items.length);
    els.statExams.textContent = String(exams);
    els.statZaliks.textContent = String(zaliks);
    els.statTeachers.textContent = String(teachers.length);
    els.statGroups.textContent = String(groups.length);

    state.conflicts = findConflicts(items);
    els.statConflicts.textContent = String(state.conflicts.length);
    els.statConflicts.title = state.conflicts.slice(0, 10).map((c) => `${c.type}: ${c.key} (${c.count})`).join('\n');
  }

  function renderRows() {
    els.tbody.innerHTML = '';
    if (!state.filtered.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="9" class="px-3 py-5 text-center text-sm text-gray-500">Нічого не знайдено</td>';
      els.tbody.appendChild(tr);
      els.count.textContent = '0';
      renderStats();
      return;
    }

    const frag = document.createDocumentFragment();
    state.filtered.forEach((item) => {
      const teacherCell = (item.teacherNames || []).length
        ? `<div class="flex flex-wrap gap-1">${item.teacherNames.map((n) => `<span class="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold">${n}</span>`).join('')}</div>`
        : '—';

      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-100 dark:border-gray-700';
      tr.innerHTML = `
        <td class="px-3 py-2 align-top text-xs">${teacherCell}</td>
        <td class="px-3 py-2 align-top text-sm">${item.discipline || '—'}</td>
        <td class="px-3 py-2 align-top text-xs">${item.controlType || '—'}</td>
        <td class="px-3 py-2 align-top text-xs">${item.examForm || '—'}</td>
        <td class="px-3 py-2 align-top text-xs font-semibold">${(item.groups || []).join(', ') || item.groupHeading || '—'}</td>
        <td class="px-3 py-2 align-top text-xs">${item.date || '—'}</td>
        <td class="px-3 py-2 align-top text-xs">${item.time || '—'}</td>
        <td class="px-3 py-2 align-top text-xs">${item.room || '—'}</td>
        <td class="px-3 py-2 align-top text-[11px] text-gray-500 dark:text-gray-400">${item.speciality || '—'}</td>
      `;
      frag.appendChild(tr);
    });

    els.tbody.appendChild(frag);
    els.count.textContent = String(state.filtered.length);
    renderStats();
  }

  function applyFilters() {
    const fTerm = norm(els.term.value);
    const fStudyForm = norm(els.studyForm.value);
    const fGroup = norm(els.group.value);
    const fTeachers = Array.from(els.teacher.selectedOptions || []).map((opt) => norm(opt.value)).filter(Boolean);
    const fControlType = norm(els.controlType.value);
    const fDiscipline = norm(els.discipline.value);
    const fDate = norm(els.date.value);

    state.filtered = state.items.filter((item) => {
      const groupsNorm = norm((item.groups || []).join(' ') + ' ' + (item.groupHeading || ''));
      const teacherNorm = norm(item.teacher);
      const teacherNamesNorm = (item.teacherNames || []).map((n) => norm(n));
      if (fTerm && norm(item.term) !== fTerm) return false;
      if (fStudyForm && norm(item.studyForm) !== fStudyForm) return false;
      if (fGroup && !groupsNorm.includes(fGroup)) return false;
      if (fTeachers.length && !fTeachers.some((t) => teacherNamesNorm.includes(t) || teacherNorm.includes(t))) return false;
      if (fControlType && norm(item.controlType) !== fControlType) return false;
      if (fDiscipline && !norm(item.discipline).includes(fDiscipline)) return false;
      if (fDate && !norm(item.date).includes(fDate)) return false;
      return true;
    }).sort((a, b) => parseSessionDate(a.date) - parseSessionDate(b.date));

    renderRows();
  }

  function exportFiltered() {
    if (!window.XLSX) return alert('XLSX бібліотека не завантажена');
    const rows = [[
      'Сесія', 'Форма навчання', 'Група', 'Дисципліна', 'Тип', 'Форма', 'Викладач', 'Дата', 'Час', 'Аудиторія', 'Спеціальність'
    ]];

    state.filtered.forEach((item) => {
      rows.push([
        item.term || '', item.studyForm || '', (item.groups || []).join(', ') || item.groupHeading || '', item.discipline || '', item.controlType || '', item.examForm || '',
        (item.teacherNames || []).join('; ') || item.teacher || '', item.date || '', item.time || '', item.room || '', item.speciality || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Session');
    XLSX.writeFile(wb, `session_filtered_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function loadData() {
    const apiRes = await fetch('/api/session');
    if (!apiRes.ok) throw new Error('Не вдалося завантажити дані сесії');
    const data = await apiRes.json();

    state.items = (Array.isArray(data.items) ? data.items : []).map((item) => {
      const teacherNames = extractTeacherNames(item.teacher);
      const parsedGroups = Array.isArray(item.groups) ? item.groups : [];
      const recoveredGroups = parsedGroups.length ? parsedGroups : parseGroupsFromHeading(item.groupHeading);
      return {
        ...item,
        term: item.term || data.term || '',
        studyForm: item.studyForm || data.studyForm || '',
        groups: uniqSorted(recoveredGroups.map((g) => clean(g).toLowerCase())),
        teacherNames,
        teacher: teacherNames.join('; ') || clean(item.teacher)
      };
    });

    const generated = data.updatedAt ? new Date(data.updatedAt).toLocaleString('uk-UA') : '—';
    els.source.textContent = `Оновлено: ${generated} · storage: ${data.storage || 'unknown'} · сесій: ${(data.sessions || []).length}`;

    const groups = uniqSorted(state.items.flatMap((i) => i.groups || []));
    const terms = uniqSorted(state.items.map((i) => i.term));
    const forms = uniqSorted(state.items.map((i) => i.studyForm));
    const teachers = uniqSorted(state.items.flatMap((i) => i.teacherNames || []));
    const controlTypes = uniqSorted(state.items.map((i) => i.controlType));

    fillSelect(els.term, terms, 'Усі сесії');
    fillSelect(els.studyForm, forms, 'Усі форми');
    fillSelect(els.group, groups, 'Усі групи');
    fillSelect(els.teacher, teachers, 'Усі викладачі', false);
    fillSelect(els.controlType, controlTypes, 'Усі типи');
    buildChips(groups);
  }

  function bind() {
    ['change', 'input'].forEach((evt) => {
      els.term.addEventListener(evt, applyFilters);
      els.studyForm.addEventListener(evt, applyFilters);
      els.group.addEventListener(evt, applyFilters);
      els.teacher.addEventListener(evt, applyFilters);
      els.controlType.addEventListener(evt, applyFilters);
      els.discipline.addEventListener(evt, applyFilters);
      els.date.addEventListener(evt, applyFilters);
    });

    els.reset.addEventListener('click', () => {
      els.term.value = '';
      els.studyForm.value = '';
      els.group.value = '';
      Array.from(els.teacher.options).forEach((o) => { o.selected = false; });
      els.controlType.value = '';
      els.discipline.value = '';
      els.date.value = '';
      applyFilters();
    });

    els.exportBtn.addEventListener('click', exportFiltered);
  }

  async function start() {
    try {
      bind();
      await loadData();
      applyFilters();
    } catch (e) {
      els.tbody.innerHTML = `<tr><td colspan="9" class="px-3 py-5 text-center text-red-600">${e.message}</td></tr>`;
    }
  }

  start();
})();
