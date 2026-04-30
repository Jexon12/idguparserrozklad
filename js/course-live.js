(function () {
  const VUZ_ID = 11927;
  const state = { faculties: [], forms: [], courses: [], groups: [], lessons: [] };
  const els = {
    date: document.getElementById('date'),
    refreshBtn: document.getElementById('refreshBtn'),
    viewMode: document.getElementById('viewMode'),
    search: document.getElementById('search'),
    facultiesBox: document.getElementById('facultiesBox'),
    formsBox: document.getElementById('formsBox'),
    coursesBox: document.getElementById('coursesBox'),
    onlyNow: document.getElementById('onlyNow'),
    onlyOffline: document.getElementById('onlyOffline'),
    meta: document.getElementById('meta'),
    cards: document.getElementById('cards'),
    tableWrap: document.getElementById('tableWrap'),
    tableBody: document.getElementById('tableBody')
  };

  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const toApiDate = (iso) => {
    const [y,m,d] = String(iso || '').split('-');
    return y && m && d ? `${d}.${m}.${y}` : '';
  };

  function checkboxList(container, items, name) {
    container.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm';
      row.innerHTML = `<input type="checkbox" data-name="${name}" value="${it.Key}" id="${name}_${idx}" checked><span>${it.Value}</span>`;
      container.appendChild(row);
    });
  }
  const checked = (name) => Array.from(document.querySelectorAll(`input[data-name="${name}"]:checked`)).map((x) => x.value);

  async function fetchApi(action, params = {}) {
    const url = new URL(`/api/${action}`, window.location.origin);
    url.searchParams.set('aVuzID', VUZ_ID);
    url.searchParams.set('_', Date.now());
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v == null ? '' : (String(v).startsWith('"') ? v : `"${v}"`)));
    const res = await fetch(url);
    const text = await res.text();
    const match = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
    const json = match ? JSON.parse(match[1]) : JSON.parse(text);
    return json.d || json;
  }

  function parseTimeSlot(lesson) {
    const start = clean(lesson.study_time_begin);
    const end = clean(lesson.study_time_end);
    const label = clean(lesson.study_time) || `${start}-${end}`;
    return { start, end, label };
  }

  function nowInSlot(dateIso, start, end) {
    if (!start || !end) return false;
    const now = new Date();
    const today = todayIso();
    if (dateIso !== today) return false;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh,sm,eh,em].some(Number.isNaN)) return false;
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0).getTime();
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0).getTime();
    const t = now.getTime();
    return t >= s && t <= e;
  }

  async function loadFilters() {
    const base = await fetchApi('GetStudentScheduleFiltersData', { aGiveStudyTimes: 'true' });
    state.faculties = Array.isArray(base.faculties) ? base.faculties : [];
    state.forms = Array.isArray(base.educForms) ? base.educForms : [];
    state.courses = Array.isArray(base.courses) ? base.courses : [];
    checkboxList(els.facultiesBox, state.faculties, 'faculty');
    checkboxList(els.formsBox, state.forms, 'form');
    checkboxList(els.coursesBox, state.courses, 'course');
  }

  async function loadGroupsForSelections() {
    const facultyIds = checked('faculty');
    const formIds = checked('form');
    const courseIds = checked('course');
    const groups = [];

    for (const f of facultyIds) {
      for (const ef of formIds) {
        for (const c of courseIds) {
          try {
            const res = await fetchApi('GetStudyGroups', { aFacultyID: f, aEducationForm: ef, aCourse: c, aGiveStudyTimes: 'false' });
            (res.studyGroups || []).forEach((g) => groups.push({ ...g, facultyId: f, formId: ef, courseId: c }));
          } catch (e) {}
        }
      }
    }
    state.groups = Array.from(new Map(groups.map((g) => [String(g.Key), g])).values());
  }

  async function loadScheduleDay() {
    const d = els.date.value || todayIso();
    els.date.value = d;
    const apiDate = toApiDate(d);
    els.meta.textContent = 'Завантаження...';
    await loadGroupsForSelections();

    const chunks = [];
    for (let i = 0; i < state.groups.length; i += 8) chunks.push(state.groups.slice(i, i + 8));

    const lessons = [];
    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(async (g) => {
        try {
          const arr = await fetchApi('GetScheduleDataX', { aStudyGroupID: g.Key, aStartDate: apiDate, aEndDate: apiDate, aStudyTypeID: '' });
          return (Array.isArray(arr) ? arr : []).map((l) => ({
            group: clean(g.Value),
            discipline: clean(l.discipline),
            teacher: clean(l.employee_short || l.employee),
            room: clean(l.auditorium || l.cabinet || l.room),
            type: clean(l.study_type),
            ...parseTimeSlot(l)
          }));
        } catch (e) { return []; }
      }));
      results.forEach((arr) => lessons.push(...arr));
    }
    state.lessons = lessons;
    render();
  }

  function filterLessons() {
    const q = clean(els.search.value).toLowerCase();
    const onlyNow = !!els.onlyNow.checked;
    const onlyOffline = !!els.onlyOffline.checked;
    const dateIso = els.date.value || todayIso();

    return state.lessons.filter((l) => {
      if (onlyNow && !nowInSlot(dateIso, l.start, l.end)) return false;
      if (onlyOffline && /online|дист|zoom|meet|teams/i.test(`${l.type} ${l.room}`)) return false;
      if (q && !`${l.group} ${l.discipline} ${l.teacher} ${l.room}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a,b) => (a.start || '').localeCompare(b.start || '') || a.group.localeCompare(b.group, 'uk'));
  }

  function renderCards(items) {
    els.cards.innerHTML = '';
    if (!items.length) {
      els.cards.innerHTML = '<div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 text-gray-500">Порожньо</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((l) => {
      const card = document.createElement('article');
      card.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow p-3 border dark:border-gray-700';
      card.innerHTML = `
        <div class="text-xs text-sky-600 font-bold mb-1">${l.group}</div>
        <div class="font-bold text-sm">${l.discipline || '—'}</div>
        <div class="text-xs text-gray-600 dark:text-gray-300 mt-1">${l.teacher || '—'}</div>
        <div class="text-xs text-gray-500 mt-1">🏫 ${l.room || '—'}</div>
        <div class="text-xs font-semibold mt-2">${l.label || `${l.start || ''}-${l.end || ''}`}</div>
      `;
      frag.appendChild(card);
    });
    els.cards.appendChild(frag);
  }

  function renderTable(items) {
    els.tableBody.innerHTML = '';
    if (!items.length) {
      els.tableBody.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-gray-500">Порожньо</td></tr>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((l) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b dark:border-gray-700';
      tr.innerHTML = `<td class="px-2 py-2">${l.group}</td><td class="px-2 py-2">${l.discipline || '—'}</td><td class="px-2 py-2">${l.teacher || '—'}</td><td class="px-2 py-2">${l.room || '—'}</td><td class="px-2 py-2">${l.label || `${l.start || ''}-${l.end || ''}`}</td>`;
      frag.appendChild(tr);
    });
    els.tableBody.appendChild(frag);
  }

  function render() {
    const items = filterLessons();
    const m = els.viewMode.value;
    if (m === 'cards') {
      els.cards.classList.remove('hidden');
      els.tableWrap.classList.add('hidden');
      renderCards(items);
    } else {
      els.cards.classList.add('hidden');
      els.tableWrap.classList.remove('hidden');
      renderTable(items);
    }
    els.meta.textContent = `Груп: ${state.groups.length} · записів: ${items.length}`;
  }

  function bind() {
    els.refreshBtn.addEventListener('click', () => loadScheduleDay().catch((e) => { els.meta.textContent = e.message; }));
    els.viewMode.addEventListener('change', render);
    els.search.addEventListener('input', render);
    els.onlyNow.addEventListener('change', render);
    els.onlyOffline.addEventListener('change', render);
    els.date.addEventListener('change', () => loadScheduleDay().catch((e) => { els.meta.textContent = e.message; }));
    [els.facultiesBox, els.formsBox, els.coursesBox].forEach((box) => box.addEventListener('change', () => loadScheduleDay().catch((e) => { els.meta.textContent = e.message; })));
  }

  async function start() {
    els.date.value = todayIso();
    bind();
    await loadFilters();
    await loadScheduleDay();
  }

  start().catch((e) => { els.meta.textContent = e.message; });
})();
