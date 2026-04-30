(function () {
  const VUZ_ID = 11927;
  const PRESETS_KEY = 'course_live_presets_v1';
  const JOURNAL_KEY = 'course_live_journal_v1';
  const state = {
    faculties: [], forms: [], courses: [], groups: [], lessons: [],
    isDirty: false,
    loadedSelection: { courses: [] },
    compareLessons: [],
    changesOnlyKeys: new Set()
  };

  const els = {
    date: document.getElementById('date'),
    compareDate: document.getElementById('compareDate'),
    refreshBtn: document.getElementById('refreshBtn'),
    compareBtn: document.getElementById('compareBtn'),
    exportBtn: document.getElementById('exportBtn'),
    savePresetBtn: document.getElementById('savePresetBtn'),
    deletePresetBtn: document.getElementById('deletePresetBtn'),
    presetSelect: document.getElementById('presetSelect'),
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
    onlyChanges: document.getElementById('onlyChanges'),
    meta: document.getElementById('meta'),
    pairStats: document.getElementById('pairStats'),
    heatmap: document.getElementById('heatmap'),
    roomConflicts: document.getElementById('roomConflicts'),
    teacherLoad: document.getElementById('teacherLoad'),
    teacherWindows: document.getElementById('teacherWindows'),
    qualityPanel: document.getElementById('qualityPanel'),
    liveBoard: document.getElementById('liveBoard'),
    campusTransitions: document.getElementById('campusTransitions'),
    changesPanel: document.getElementById('changesPanel'),
    suggestionsPanel: document.getElementById('suggestionsPanel'),
    journalPanel: document.getElementById('journalPanel'),
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
  const lessonKey = (l) => `${l.group}|${l.discipline}|${l.teacher}|${l.room}|${l.pair}|${l.label}`;

  function appendJournal(action, details) {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({ at: new Date().toISOString(), action, details });
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(arr.slice(0, 120)));
    renderJournal();
  }

  function renderJournal() {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr.length) {
      els.journalPanel.textContent = 'Поки що без записів';
      return;
    }
    els.journalPanel.innerHTML = arr.slice(0, 20).map((x) => `<div class="py-1 border-b dark:border-gray-700"><b>${new Date(x.at).toLocaleString('uk-UA')}</b> · ${clean(x.action)} · ${clean(x.details || '')}</div>`).join('');
  }

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
  const checkedLabels = (name) => Array.from(document.querySelectorAll(`input[data-name="${name}"]:checked`)).map((x) => x.closest('label')?.textContent?.trim() || x.value);
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

  function buildingKey(room) {
    const text = clean(room).toLowerCase();
    if (!text) return '';
    const corp = text.match(/к\d+|корпус\s*\d+/i);
    if (corp) return corp[0].replace(/\s+/g, '');
    const num = text.match(/\d{3,4}/);
    return num ? String(num[0]).slice(0, 1) : '';
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

  async function fetchDayLessons(dateIso) {
    const apiDate = toApiDate(dateIso);
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
    return lessons;
  }

  async function loadScheduleDay() {
    const d = els.date.value || todayIso();
    els.date.value = d;
    els.meta.textContent = 'Завантаження...';
    state.lessons = await fetchDayLessons(d);
    state.isDirty = false;
    appendJournal('Оновлення', `Дата ${d}, груп ${state.groups.length}, записів ${state.lessons.length}`);
    render();
  }

  async function compareWithDate() {
    if (state.isDirty) {
      els.changesPanel.textContent = 'Спочатку натисніть "Оновити зараз".';
      return;
    }
    const d = els.compareDate.value;
    if (!d) {
      els.changesPanel.textContent = 'Оберіть дату для порівняння.';
      return;
    }
    els.changesPanel.textContent = 'Порівняння...';
    const base = await fetchDayLessons(d);
    state.compareLessons = base;
    const baseSet = new Set(base.map(lessonKey));
    const nowSet = new Set(state.lessons.map(lessonKey));
    const added = state.lessons.filter((x) => !baseSet.has(lessonKey(x)));
    const removed = base.filter((x) => !nowSet.has(lessonKey(x)));
    state.changesOnlyKeys = new Set(added.map(lessonKey));
    els.changesPanel.innerHTML = [
      `<div>Додано: <b>${added.length}</b></div>`,
      `<div>Прибрано: <b>${removed.length}</b></div>`,
      removed.slice(0, 8).map((x) => `<div class="text-xs">- ${x.group} · ${x.discipline} · ${x.label}</div>`).join('')
    ].join('');
    renderSuggestions(added, removed);
    appendJournal('Порівняння', `З ${d}: +${added.length}/-${removed.length}`);
    render();
  }

  function filterLessons() {
    const q = clean(els.search.value).toLowerCase();
    const onlyNow = !!els.onlyNow.checked;
    const onlyOffline = !!els.onlyOffline.checked;
    const onlyChanges = !!els.onlyChanges.checked;
    const pairFilter = clean(els.pairFilter.value);
    const dateIso = els.date.value || todayIso();

    return state.lessons.filter((l) => {
      if (onlyNow && !nowInSlot(dateIso, l.start, l.end)) return false;
      if (onlyOffline && /online|дист|zoom|meet|teams/i.test(`${l.type} ${l.room}`)) return false;
      if (pairFilter && String(l.pair) !== pairFilter) return false;
      if (onlyChanges && !state.changesOnlyKeys.has(lessonKey(l))) return false;
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

  function renderHeatmap(items) {
    const pairs = [1, 2, 3, 4, 5, 6, 7];
    const map = new Map();
    items.forEach((l) => map.set(Number(l.pair), (map.get(Number(l.pair)) || 0) + 1));
    const max = Math.max(1, ...Array.from(map.values()));
    els.heatmap.innerHTML = pairs.map((p) => {
      const v = map.get(p) || 0;
      const alpha = Math.max(0.08, v / max);
      return `<div class="grid grid-cols-[80px_1fr_56px] items-center gap-2"><div class="text-sm">${p} пара</div><div class="h-6 rounded" style="background: rgba(14,165,233,${alpha.toFixed(3)})"></div><div class="text-xs text-right">${v}</div></div>`;
    }).join('');
  }

  function renderRoomConflicts(items) {
    const bucket = new Map();
    items.forEach((l) => {
      if (!l.room) return;
      const k = `${l.pair}|${l.room.toLowerCase()}`;
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k).push(l);
    });
    const bad = Array.from(bucket.entries()).filter(([, arr]) => arr.length > 1);
    if (!bad.length) {
      els.roomConflicts.textContent = 'Конфліктів аудиторій не знайдено';
      return;
    }
    els.roomConflicts.innerHTML = bad.slice(0, 20).map(([k, arr]) => {
      const [pair, room] = k.split('|');
      const groups = Array.from(new Set(arr.map((x) => x.group))).join(', ');
      return `<div class="py-1 border-b dark:border-gray-700"><b>${pair} пара · ${room}</b>: ${groups}</div>`;
    }).join('');
  }

  function renderTeacherLoad(items) {
    const map = new Map();
    items.forEach((l) => {
      const t = clean(l.teacher);
      if (!t) return;
      if (!map.has(t)) map.set(t, { count: 0, groups: new Set(), pairs: new Set() });
      const r = map.get(t);
      r.count += 1;
      r.groups.add(l.group);
      r.pairs.add(l.pair);
    });
    const rows = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 20);
    if (!rows.length) {
      els.teacherLoad.textContent = 'Немає даних';
      return;
    }
    els.teacherLoad.innerHTML = rows.map(([t, v]) => `<div class="py-1 border-b dark:border-gray-700"><b>${t}</b>: ${v.count} пар · груп ${v.groups.size}</div>`).join('');
  }

  function renderTeacherWindows(items) {
    const byTeacher = new Map();
    items.forEach((l) => {
      const t = clean(l.teacher);
      if (!t) return;
      if (!byTeacher.has(t)) byTeacher.set(t, new Set());
      byTeacher.get(t).add(Number(l.pair));
    });
    const windows = [];
    byTeacher.forEach((pairs, t) => {
      const arr = Array.from(pairs).sort((a, b) => a - b);
      if (arr.length < 2) return;
      const missing = [];
      for (let p = arr[0] + 1; p < arr[arr.length - 1]; p++) {
        if (!pairs.has(p)) missing.push(p);
      }
      if (missing.length) windows.push({ t, missing });
    });
    if (!windows.length) {
      els.teacherWindows.textContent = 'Окон викладачів не знайдено';
      return;
    }
    els.teacherWindows.innerHTML = windows.slice(0, 20).map((w) => `<div class="py-1 border-b dark:border-gray-700"><b>${w.t}</b>: ${w.missing.join(', ')}</div>`).join('');
  }

  function renderQuality(items) {
    const missingTeacher = items.filter((x) => !clean(x.teacher)).length;
    const missingRoom = items.filter((x) => !clean(x.room)).length;
    const missingDisc = items.filter((x) => !clean(x.discipline)).length;
    const seen = new Set();
    let dup = 0;
    items.forEach((x) => {
      const k = lessonKey(x);
      if (seen.has(k)) dup += 1;
      seen.add(k);
    });
    const normalize = (v) => clean(v).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const tMap = new Map();
    items.forEach((x) => {
      const n = normalize(x.teacher);
      if (!n) return;
      if (!tMap.has(n)) tMap.set(n, new Set());
      tMap.get(n).add(clean(x.teacher));
    });
    const variants = Array.from(tMap.values()).filter((s) => s.size > 1).length;
    els.qualityPanel.innerHTML = [
      `<div>Без викладача: <b>${missingTeacher}</b></div>`,
      `<div>Без аудиторії: <b>${missingRoom}</b></div>`,
      `<div>Без предмету: <b>${missingDisc}</b></div>`,
      `<div>Дублікатів: <b>${dup}</b></div>`,
      `<div>Варіантів ПІБ: <b>${variants}</b></div>`
    ].join('');
  }

  function renderLiveBoard(items) {
    const d = els.date.value || todayIso();
    const nowList = items.filter((x) => nowInSlot(d, x.start, x.end));
    const curPair = nowList.length ? nowList[0].pair : null;
    const nextPair = curPair ? curPair + 1 : null;
    const nextList = nextPair ? items.filter((x) => Number(x.pair) === Number(nextPair)) : [];
    els.liveBoard.innerHTML = [
      `<div>Зараз: <b>${curPair ? `${curPair} пара` : 'немає активної пари'}</b> · записів ${nowList.length}</div>`,
      `<div>Наступна: <b>${nextPair ? `${nextPair} пара` : '—'}</b> · записів ${nextList.length}</div>`,
      nowList.slice(0, 6).map((x) => `<div class="text-xs">${x.group} · ${x.discipline} · ${x.room || '—'}</div>`).join('')
    ].join('');
  }

  function renderCampusTransitions(items) {
    const byGroup = new Map();
    items.forEach((l) => {
      if (!byGroup.has(l.group)) byGroup.set(l.group, []);
      byGroup.get(l.group).push(l);
    });
    const rows = [];
    byGroup.forEach((list, g) => {
      const sorted = list.slice().sort((a, b) => a.pair - b.pair);
      let moves = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prev = buildingKey(sorted[i - 1].room);
        const cur = buildingKey(sorted[i].room);
        if (prev && cur && prev !== cur) moves += 1;
      }
      if (moves > 0) rows.push({ g, moves });
    });
    if (!rows.length) {
      els.campusTransitions.textContent = 'Критичних переходів між корпусами не знайдено';
      return;
    }
    els.campusTransitions.innerHTML = rows.sort((a, b) => b.moves - a.moves).slice(0, 20).map((x) => `<div class="py-1 border-b dark:border-gray-700"><b>${x.g}</b>: переходів ${x.moves}</div>`).join('');
  }

  function renderSuggestions(added, removed) {
    if (!added.length && !removed.length) {
      els.suggestionsPanel.textContent = 'Змін не знайдено. Підказки не потрібні.';
      return;
    }
    const tips = [];
    if (added.length) {
      const x = added[0];
      tips.push(`Додано ${x.group} · ${x.discipline} (${x.label}) — перевірте аудиторію та викладача на конфлікт.`);
    }
    if (removed.length) {
      const y = removed[0];
      tips.push(`Зникло ${y.group} · ${y.discipline} (${y.label}) — перевірте чи це планова заміна.`);
    }
    els.suggestionsPanel.innerHTML = tips.map((t) => `<div class="py-1">${t}</div>`).join('');
  }

  function render() {
    const items = filterLessons();
    renderPairStats(items);
    renderHeatmap(items);
    renderRoomConflicts(items);
    renderTeacherLoad(items);
    renderTeacherWindows(items);
    renderQuality(items);
    renderLiveBoard(items);
    renderCampusTransitions(items);
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
    for (let p = minPair + 1; p < maxPair; p++) if (!byPair.has(p)) commonWindows.push(p);
    if (!commonWindows.length) {
      els.windowsMeta.textContent = `Спільні вікна: немає (активні пари ${minPair}-${maxPair})`;
      return;
    }
    els.windowsMeta.textContent = `Спільні вікна: ${commonWindows.join(', ')} пара`;
  }

  function getSelectionPreset() {
    return {
      name: '',
      faculty: checked('faculty'),
      form: checked('form'),
      course: checked('course')
    };
  }

  function loadPresetOptions() {
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    els.presetSelect.innerHTML = '<option value="">Пресет: —</option>' + arr.map((p, i) => `<option value="${i}">${clean(p.name)}</option>`).join('');
  }

  function savePreset() {
    const name = prompt('Назва пресета:');
    if (!name) return;
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const p = getSelectionPreset();
    p.name = name;
    arr.push(p);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(arr));
    loadPresetOptions();
    appendJournal('Пресет', `Збережено "${name}"`);
  }

  function applyPreset() {
    const idx = Number(els.presetSelect.value);
    if (!Number.isFinite(idx)) return;
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const p = arr[idx];
    if (!p) return;
    setChecks('faculty', false);
    setChecks('form', false);
    setChecks('course', false);
    document.querySelectorAll('input[data-name="faculty"]').forEach((x) => { if (p.faculty.includes(x.value)) x.checked = true; });
    document.querySelectorAll('input[data-name="form"]').forEach((x) => { if (p.form.includes(x.value)) x.checked = true; });
    document.querySelectorAll('input[data-name="course"]').forEach((x) => { if (p.course.includes(x.value)) x.checked = true; });
    markDirty('Застосовано пресет.');
    appendJournal('Пресет', `Застосовано "${p.name}"`);
  }

  function deletePreset() {
    const idx = Number(els.presetSelect.value);
    if (!Number.isFinite(idx)) return;
    const raw = localStorage.getItem(PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr[idx]) return;
    const name = arr[idx].name;
    arr.splice(idx, 1);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(arr));
    loadPresetOptions();
    appendJournal('Пресет', `Видалено "${name}"`);
  }

  function exportCurrent() {
    if (!window.XLSX) {
      els.meta.textContent = 'XLSX не завантажено';
      return;
    }
    const rows = filterLessons().map((x) => ({
      Група: x.group,
      Предмет: x.discipline,
      Викладач: x.teacher,
      Аудиторія: x.room,
      Пара: `${x.pair}`,
      Час: x.label
    }));
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Повідомлення: 'Немає записів' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CourseDay');
    XLSX.writeFile(wb, `course_day_${els.date.value || todayIso()}.xlsx`);
    appendJournal('Експорт', `Експортовано ${rows.length} рядків`);
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
    els.compareBtn.addEventListener('click', () => compareWithDate().catch((e) => { els.meta.textContent = `Помилка порівняння: ${e.message}`; }));
    els.exportBtn.addEventListener('click', exportCurrent);
    els.savePresetBtn.addEventListener('click', savePreset);
    els.deletePresetBtn.addEventListener('click', deletePreset);
    els.presetSelect.addEventListener('change', applyPreset);
    els.viewMode.addEventListener('change', render);
    els.pairFilter.addEventListener('change', render);
    els.search.addEventListener('input', render);
    els.onlyNow.addEventListener('change', render);
    els.onlyOffline.addEventListener('change', render);
    els.onlyChanges.addEventListener('change', render);

    els.date.addEventListener('change', () => markDirty('Дата змінена.'));
    els.compareDate.addEventListener('change', () => appendJournal('Порівняння', `Обрано дату ${els.compareDate.value}`));
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
    els.compareDate.value = todayIso();
    bind();
    await loadFilters();
    loadPresetOptions();
    renderJournal();
    state.isDirty = true;
    els.meta.textContent = 'Оберіть фільтри та натисніть "Оновити зараз".';
    els.windowsMeta.textContent = 'Вікна: натисніть "Оновити зараз", потім "Знайти вікна"';
    els.liveBoard.textContent = 'Очікування завантаження...';
    const selectedCourses = checkedLabels('course').join(', ');
    appendJournal('Старт', `Сторінка відкрита. Курси за замовчуванням: ${selectedCourses}`);
  }

  start().catch((e) => {
    els.meta.textContent = `Помилка: ${e.message}`;
  });
})();
