(function () {
  const VUZ_ID = 11927;
  const state = {
    faculties: [], forms: [], courses: [], groups: [], lessons: [],
    isDirty: false,
    loadedSelection: { courses: [] }
  };

  const els = {
    date: document.getElementById('date'),
    refreshBtn: document.getElementById('refreshBtn'),
    viewMode: document.getElementById('viewMode'),
    pairFilter: document.getElementById('pairFilter'),
    findWindowsBtn: document.getElementById('findWindowsBtn'),
    windowsMeta: document.getElementById('windowsMeta'),
    search: document.getElementById('search'),
    facultiesBox: document.getElementById('facultiesBox'),
    formsBox: document.getElementById('formsBox'),
    coursesBox: document.getElementById('coursesBox'),
    allFacultyBtn: document.getElementById('allFacultyBtn'),
    noneFacultyBtn: document.getElementById('noneFacultyBtn'),
    allFormBtn: document.getElementById('allFormBtn'),
    noneFormBtn: document.getElementById('noneFormBtn'),
    allCourseBtn: document.getElementById('allCourseBtn'),
    noneCourseBtn: document.getElementById('noneCourseBtn'),
    onlyNow: document.getElementById('onlyNow'),
    onlyOffline: document.getElementById('onlyOffline'),
    meta: document.getElementById('meta'),
    pairStats: document.getElementById('pairStats'),
    cardsGrouped: document.getElementById('cardsGrouped'),
    tableWrap: document.getElementById('tableWrap'),
    tableBody: document.getElementById('tableBody')
  };

  const clean = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const toApiDate = (iso) => {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}.${m}.${y}` : '';
  };

  function checkboxList(container, items, name) {
    container.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700';
      row.innerHTML = `<input type="checkbox" data-name="${name}" value="${it.Key}" id="${name}_${idx}" checked><span>${it.Value}</span>`;
      container.appendChild(row);
    });
  }

  const checked = (name) => Array.from(document.querySelectorAll(`input[data-name="${name}"]:checked`)).map((x) => x.value);
  const setChecks = (name, value) => document.querySelectorAll(`input[data-name="${name}"]`).forEach((x) => { x.checked = value; });

  async function fetchApi(action, params = {}) {
    const url = new URL(`/api/${action}`, window.location.origin);
    url.searchParams.set('aVuzID', VUZ_ID);
    url.searchParams.set('_', Date.now());
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v == null ? '' : (String(v).startsWith('"') ? v : `"${v}"`)));
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
    const pair = (label.match(/(\d+)/) || [null, '99'])[1];
    return { start, end, label, pair: Number(pair) };
  }

  function nowInSlot(dateIso, start, end) {
    if (!start || !end || dateIso !== todayIso()) return false;
    const now = new Date();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return false;
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0).getTime();
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em, 0).getTime();
    return now.getTime() >= s && now.getTime() <= e;
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
            (res.studyGroups || []).forEach((g) => groups.push({ ...g }));
          } catch (e) {}
        }
      }
    }

    state.groups = Array.from(new Map(groups.map((g) => [String(g.Key), g])).values());
    state.loadedSelection.courses = courseIds.slice();
  }

  async function loadScheduleDay() {
    const d = els.date.value || todayIso();
    els.date.value = d;
    const apiDate = toApiDate(d);
    els.meta.textContent = 'Завантаження...';

    await loadGroupsForSelections();

    const chunks = [];
    for (let i = 0; i < state.groups.length; i += 10) chunks.push(state.groups.slice(i, i + 10));

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
    state.isDirty = false;
    render();
  }

  function filterLessons() {
    const q = clean(els.search.value).toLowerCase();
    const onlyNow = !!els.onlyNow.checked;
    const onlyOffline = !!els.onlyOffline.checked;
    const pairFilter = clean(els.pairFilter.value);
    const dateIso = els.date.value || todayIso();

    return state.lessons.filter((l) => {
      if (onlyNow && !nowInSlot(dateIso, l.start, l.end)) return false;
      if (onlyOffline && /online|дист|zoom|meet|teams/i.test(`${l.type} ${l.room}`)) return false;
      if (pairFilter && String(l.pair) !== pairFilter) return false;
      if (q && !`${l.group} ${l.discipline} ${l.teacher} ${l.room}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (a.pair - b.pair) || (a.start || '').localeCompare(b.start || '') || a.group.localeCompare(b.group, 'uk'));
  }

  function renderPairStats(items) {
    const map = new Map();
    items.forEach((l) => {
      const key = `${l.pair} пара`;
      map.set(key, (map.get(key) || 0) + 1);
    });
    const list = Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
    els.pairStats.innerHTML = list.map(([k, v]) => `<span class="px-2 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold">${k}: ${v}</span>`).join('');
  }

  function renderCards(items) {
    els.cardsGrouped.innerHTML = '';
    if (!items.length) {
      els.cardsGrouped.innerHTML = '<div class="bg-white dark:bg-gray-800 rounded-2xl shadow p-5 text-gray-500">Немає пар за вибраними фільтрами</div>';
      return;
    }
    const byPair = new Map();
    items.forEach((l) => {
      const key = `${l.pair} пара`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(l);
    });

    const frag = document.createDocumentFragment();
    Array.from(byPair.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([pair, list]) => {
      const sec = document.createElement('section');
      sec.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow p-3';
      sec.innerHTML = `<div class="flex items-center justify-between mb-2"><div class="font-bold text-sky-700 dark:text-sky-300">${pair}</div><div class="text-xs text-gray-500">${list.length} записів</div></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-slot></div>`;
      const slot = sec.querySelector('[data-slot]');
      list.forEach((l) => {
        const card = document.createElement('article');
        card.className = 'rounded-xl border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/30';
        card.innerHTML = `<div class="flex items-center justify-between gap-2"><div class="text-sm font-black text-gray-900 dark:text-gray-100">${l.group}</div><span class="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700">${l.label}</span></div><div class="font-bold text-sm mt-1">${l.discipline || '—'}</div><div class="text-xs text-gray-600 dark:text-gray-300 mt-1">👨‍🏫 ${l.teacher || '—'}</div><div class="text-xs text-gray-500 mt-1">🏫 ${l.room || '—'}</div>`;
        slot.appendChild(card);
      });
      frag.appendChild(sec);
    });
    els.cardsGrouped.appendChild(frag);
  }

  function renderTable(items) {
    els.tableBody.innerHTML = '';
    if (!items.length) {
      els.tableBody.innerHTML = '<tr><td colspan="5" class="px-3 py-4 text-gray-500">Немає пар за вибраними фільтрами</td></tr>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((l) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b dark:border-gray-700';
      tr.innerHTML = `<td class="px-2 py-2 font-bold">${l.group}</td><td class="px-2 py-2">${l.discipline || '—'}</td><td class="px-2 py-2">${l.teacher || '—'}</td><td class="px-2 py-2">${l.room || '—'}</td><td class="px-2 py-2">${l.label}</td>`;
      frag.appendChild(tr);
    });
    els.tableBody.appendChild(frag);
  }

  function render() {
    const items = filterLessons();
    renderPairStats(items);
    if (els.viewMode.value === 'cards') {
      els.cardsGrouped.classList.remove('hidden');
      els.tableWrap.classList.add('hidden');
      renderCards(items);
    } else {
      els.cardsGrouped.classList.add('hidden');
      els.tableWrap.classList.remove('hidden');
      renderTable(items);
    }
    const pairInfo = clean(els.pairFilter.value) ? ` · фільтр: ${els.pairFilter.value} пара` : '';
    const coursesLoaded = state.loadedSelection.courses.length ? state.loadedSelection.courses.join(',') : '—';
    const dirtyInfo = state.isDirty ? ' · є незастосовані зміни' : '';
    els.meta.textContent = `Груп: ${state.groups.length} · записів: ${items.length}${pairInfo} · завантажені курси: ${coursesLoaded}${dirtyInfo}`;
  }

  function findWindows() {
    if (state.isDirty) {
      els.windowsMeta.textContent = 'Спочатку натисніть "Оновити зараз", щоб аналізувати нові фільтри.';
      return;
    }
    const items = filterLessons();
    const byPair = new Map();
    items.forEach((l) => {
      const p = Number(l.pair);
      if (!Number.isFinite(p) || p < 1 || p > 7) return;
      byPair.set(p, (byPair.get(p) || 0) + 1);
    });

    const activePairs = Array.from(byPair.keys()).sort((a, b) => a - b);
    if (activePairs.length < 2) {
      els.windowsMeta.textContent = 'Спільні вікна: недостатньо пар для аналізу';
      return;
    }

    const minPair = activePairs[0];
    const maxPair = activePairs[activePairs.length - 1];
    const commonWindows = [];
    for (let p = minPair + 1; p < maxPair; p++) {
      if (!byPair.has(p)) commonWindows.push(p);
    }

    if (!commonWindows.length) {
      els.windowsMeta.textContent = `Спільні вікна: немає (активні пари ${minPair}-${maxPair})`;
      return;
    }

    els.windowsMeta.textContent = `Спільні вікна: ${commonWindows.join(', ')} пара`;
  }

  function triggerReload() {
    loadScheduleDay().catch((e) => {
      els.meta.textContent = `Помилка: ${e.message}`;
    });
  }

  function markDirty(msg) {
    state.isDirty = true;
    els.meta.textContent = `${msg} Натисніть "Оновити зараз".`;
  }

  function bind() {
    els.refreshBtn.addEventListener('click', triggerReload);
    els.viewMode.addEventListener('change', render);
    els.pairFilter.addEventListener('change', render);
    els.search.addEventListener('input', render);
    els.onlyNow.addEventListener('change', render);
    els.onlyOffline.addEventListener('change', render);

    els.date.addEventListener('change', () => markDirty('Дата змінена.'));
    [els.facultiesBox, els.formsBox, els.coursesBox].forEach((box) => box.addEventListener('change', () => markDirty('Фільтри змінені.')));

    els.allFacultyBtn.addEventListener('click', () => { setChecks('faculty', true); markDirty('Факультети вибрані.'); });
    els.noneFacultyBtn.addEventListener('click', () => { setChecks('faculty', false); markDirty('Факультети очищені.'); });
    els.allFormBtn.addEventListener('click', () => { setChecks('form', true); markDirty('Форми вибрані.'); });
    els.noneFormBtn.addEventListener('click', () => { setChecks('form', false); markDirty('Форми очищені.'); });
    els.allCourseBtn.addEventListener('click', () => { setChecks('course', true); markDirty('Курси вибрані.'); });
    els.noneCourseBtn.addEventListener('click', () => { setChecks('course', false); markDirty('Курси очищені.'); });

    els.findWindowsBtn.addEventListener('click', findWindows);
  }

  async function start() {
    els.date.value = todayIso();
    bind();
    await loadFilters();
    state.isDirty = true;
    els.meta.textContent = 'Оберіть фільтри та натисніть "Оновити зараз".';
    els.windowsMeta.textContent = 'Вікна: натисніть "Оновити зараз", потім "Знайти вікна"';
  }

  start().catch((e) => {
    els.meta.textContent = `Помилка: ${e.message}`;
  });
})();
