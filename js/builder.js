window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
    const PAIRS = [1, 2, 3, 4, 5, 6, 7];
    const PAIR_TIMES = SA.defaultTimes || {};

    const state = {
        mode: 'group',
        faculties: [],
        eduForms: [],
        courses: [],
        chairs: [],
        entities: [],
        weekDays: [],
        normalized: [],
        lastSourceCount: 0
    };

    const els = {
        root: document.getElementById('builderRoot'),
        modeSelect: document.getElementById('modeSelect'),
        facultySelect: document.getElementById('facultySelect'),
        eduFormSelect: document.getElementById('eduFormSelect'),
        courseSelect: document.getElementById('courseSelect'),
        chairSelect: document.getElementById('chairSelect'),
        entitySelect: document.getElementById('entitySelect'),
        weekStart: document.getElementById('weekStart'),
        weekEnd: document.getElementById('weekEnd'),
        prevWeekBtn: document.getElementById('prevWeekBtn'),
        nextWeekBtn: document.getElementById('nextWeekBtn'),
        buildBtn: document.getElementById('buildBtn'),
        buildBtnPrimary: document.getElementById('buildBtnPrimary'),
        status: document.getElementById('status'),
        tableHead: document.getElementById('tableHead'),
        tableBody: document.getElementById('tableBody'),
        sumLessons: document.getElementById('sumLessons'),
        sumDays: document.getElementById('sumDays'),
        sumConflicts: document.getElementById('sumConflicts'),
        sumDuplicates: document.getElementById('sumDuplicates'),
        sumSources: document.getElementById('sumSources')
    };

    function setStatus(msg, isError) {
        els.status.textContent = msg;
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-500';
    }

    function toIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function toDmyIso(iso) {
        const p = String(iso).split('-');
        if (p.length !== 3) return '';
        return `${p[2]}.${p[1]}.${p[0]}`;
    }

    function parseDmy(dmy) {
        const p = String(dmy || '').split('.');
        if (p.length !== 3) return null;
        return new Date(`${p[2]}-${p[1]}-${p[0]}T00:00:00`);
    }

    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function setCurrentWeek() {
        const monday = getMonday(new Date());
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);
        els.weekStart.value = toIso(monday);
        els.weekEnd.value = toIso(friday);
    }

    function shiftWeek(delta) {
        const start = new Date(`${els.weekStart.value}T00:00:00`);
        const end = new Date(`${els.weekEnd.value}T00:00:00`);
        start.setDate(start.getDate() + delta * 7);
        end.setDate(end.getDate() + delta * 7);
        els.weekStart.value = toIso(start);
        els.weekEnd.value = toIso(end);
    }

    function getPairFromStartTime(start) {
        const s = String(start || '').slice(0, 5);
        if (!s) return 0;
        for (const [pair, t] of Object.entries(PAIR_TIMES)) {
            if (t && t.start === s) return parseInt(pair, 10);
        }
        return 0;
    }

    function parsePair(raw) {
        const m = String(raw.study_time || '').match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
        return getPairFromStartTime(raw.study_time_begin);
    }

    function stripTeacher(raw) {
        const txt = SA.stripHtml(raw.teacher || raw.employee || '');
        return txt.replace(/\s+/g, ' ').trim();
    }

    function normalizeLesson(raw, sourceName) {
        const dt = parseDmy(raw.full_date || '');
        if (!dt) return null;
        const dow = dt.getDay();
        if (dow === 0 || dow === 6) return null;

        const groupName = String(raw.contingent || raw.study_group || raw.groupName || sourceName || '').trim();

        return {
            date: raw.full_date || '',
            dow,
            pair: parsePair(raw),
            discipline: String(raw.discipline || '').trim(),
            type: String(raw.study_type || '').trim(),
            teacher: stripTeacher(raw),
            group: groupName,
            sourceName: sourceName || groupName,
            room: String(raw.cabinet || '').trim(),
            start: String(raw.study_time_begin || '').slice(0, 5),
            end: String(raw.study_time_end || '').slice(0, 5)
        };
    }

    function fillSelect(selectEl, values, labelKey, valueKey, autoSelectFirst) {
        const current = selectEl.value;
        while (selectEl.options.length > 1) selectEl.remove(1);
        values.forEach((item) => {
            const o = document.createElement('option');
            o.value = String(item[valueKey] || '');
            o.textContent = String(item[labelKey] || '');
            selectEl.appendChild(o);
        });
        if (current && values.some((v) => String(v[valueKey] || '') === current)) {
            selectEl.value = current;
        } else if (autoSelectFirst && selectEl.options.length > 1) {
            selectEl.selectedIndex = 1;
        } else {
            selectEl.selectedIndex = 0;
        }
    }

    function setModeUI() {
        const isGroup = state.mode === 'group';
        const isTeacher = state.mode === 'teacher';
        const isFaculty = state.mode === 'faculty';

        els.root.classList.toggle('is-faculty', isFaculty);

        els.eduFormSelect.classList.toggle('hidden', !isGroup);
        els.courseSelect.classList.toggle('hidden', !isGroup);
        els.chairSelect.classList.toggle('hidden', !isTeacher);
        els.entitySelect.classList.toggle('hidden', isFaculty);

        if (isGroup) els.entitySelect.innerHTML = '<option value="">Оберіть групу...</option>';
        else if (isTeacher) els.entitySelect.innerHTML = '<option value="">Оберіть викладача...</option>';
        else els.entitySelect.innerHTML = '<option value="">У режимі факультету вибір не потрібен</option>';
    }

    async function loadBaseFilters() {
        setStatus('Завантаження фільтрів...');
        const data = await SA.fetchApi('GetStudentScheduleFiltersData', {}, { useCache: false });
        if (!data) {
            setStatus('Не вдалося завантажити фільтри', true);
            return;
        }
        state.faculties = data.faculties || [];
        state.eduForms = data.educForms || [];
        state.courses = data.courses || [];
        fillSelect(els.facultySelect, state.faculties, 'Value', 'Key', true);
        fillSelect(els.eduFormSelect, state.eduForms, 'Value', 'Key', true);
        fillSelect(els.courseSelect, state.courses, 'Value', 'Key', true);
        setStatus('Фільтри готові');
    }

    async function loadGroups() {
        if (!els.facultySelect.value) return;
        setStatus('Завантаження груп...');
        const data = await SA.fetchApi('GetStudyGroups', {
            aFacultyID: els.facultySelect.value,
            aEducationForm: els.eduFormSelect.value || '0',
            aCourse: els.courseSelect.value || '0'
        }, { useCache: false });
        state.entities = (data && data.studyGroups) ? data.studyGroups : [];
        fillSelect(els.entitySelect, state.entities, 'Value', 'Key', false);
        setStatus(`Знайдено груп: ${state.entities.length}`);
    }

    async function loadChairs() {
        if (!els.facultySelect.value) return;
        setStatus('Завантаження кафедр...');
        const data = await SA.fetchApi('GetEmployeeChairs', { aFacultyID: els.facultySelect.value }, { useCache: false });
        state.chairs = (data && data.chairs) ? data.chairs : [];
        fillSelect(els.chairSelect, state.chairs, 'Value', 'Key', true);
        if (els.chairSelect.value) await loadEmployees();
    }

    async function loadEmployees() {
        if (!els.facultySelect.value || !els.chairSelect.value) return;
        setStatus('Завантаження викладачів...');
        const data = await SA.fetchApi('GetEmployees', {
            aFacultyID: els.facultySelect.value,
            aChairID: els.chairSelect.value
        }, { useCache: false });
        state.entities = Array.isArray(data) ? data : [];
        fillSelect(els.entitySelect, state.entities, 'Value', 'Key', false);
        setStatus(`Знайдено викладачів: ${state.entities.length}`);
    }

    function buildWeekDays() {
        const start = new Date(`${els.weekStart.value}T00:00:00`);
        const days = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            days.push({
                dow: i + 1,
                iso: toIso(d),
                dmy: toDmyIso(toIso(d)),
                label: `${DAY_NAMES[i]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
            });
        }
        state.weekDays = days;
    }

    function renderTable(lessons) {
        const map = new Map();
        const stableSeen = new Set();
        let duplicates = 0;

        lessons.forEach((l) => {
            if (!l || !l.pair) return;
            const key = `${l.dow}-${l.pair}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(l);

            const stable = [l.date, l.pair, l.discipline, l.teacher, l.group, l.room].join('||');
            if (stableSeen.has(stable)) duplicates += 1;
            stableSeen.add(stable);
        });

        els.tableHead.innerHTML = '';
        els.tableBody.innerHTML = '';

        const trHead = document.createElement('tr');
        trHead.innerHTML = `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Пара</th>${
            state.weekDays.map((d) => `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">${d.label}</th>`).join('')
        }`;
        els.tableHead.appendChild(trHead);

        let conflictSlots = 0;
        PAIRS.forEach((pair) => {
            const tr = document.createElement('tr');
            let row = `<td class="p-2 border dark:border-gray-700 font-bold align-top">${pair} пара</td>`;

            state.weekDays.forEach((day) => {
                const cellKey = `${day.dow}-${pair}`;
                const items = map.get(cellKey) || [];
                if (items.length > 1) conflictSlots += 1;

                const chipHtml = items.map((it) => {
                    let subtitle = '';
                    if (state.mode === 'group') {
                        subtitle = it.teacher || 'Викладач не вказаний';
                    } else if (state.mode === 'teacher') {
                        subtitle = it.group || it.sourceName || 'Група не вказана';
                    } else {
                        subtitle = `${it.group || it.sourceName || 'Група ?'} · ${it.teacher || 'Викладач ?'}`;
                    }

                    const timeText = (it.start && it.end) ? `${it.start}-${it.end}` : '';
                    return `
                        <div class="lesson-chip ${items.length > 1 ? 'lesson-conflict' : ''} bg-gray-50 dark:bg-gray-700 rounded p-2 mb-2 last:mb-0">
                            <div class="font-semibold">${it.discipline || 'Без назви'}</div>
                            <div class="text-xs text-gray-500">${subtitle}</div>
                            <div class="text-xs text-gray-500">${it.type || 'Тип не вказано'} · ${it.room || '—'} ${timeText ? `· ${timeText}` : ''}</div>
                        </div>
                    `;
                }).join('');

                row += `<td class="slot-cell p-2 border dark:border-gray-700">${chipHtml || '<span class="text-xs text-gray-400">—</span>'}</td>`;
            });

            tr.innerHTML = row;
            els.tableBody.appendChild(tr);
        });

        const activeDays = state.weekDays.filter((day) => PAIRS.some((pair) => (map.get(`${day.dow}-${pair}`) || []).length > 0)).length;

        els.sumLessons.textContent = String(lessons.length);
        els.sumDays.textContent = String(activeDays);
        els.sumConflicts.textContent = String(conflictSlots);
        els.sumDuplicates.textContent = String(duplicates);
        els.sumSources.textContent = String(state.lastSourceCount || 0);
    }

    function chunk(items, size) {
        const out = [];
        for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
        return out;
    }

    async function fetchAllFacultyGroups(facultyId) {
        const eduKeys = (state.eduForms || []).map((x) => String(x.Key || '')).filter(Boolean);
        const courseKeys = (state.courses || []).map((x) => String(x.Key || '')).filter(Boolean);
        const pairs = [];
        eduKeys.forEach((ef) => courseKeys.forEach((c) => pairs.push({ ef, c })));

        const all = [];
        for (const batch of chunk(pairs, 8)) {
            const responses = await Promise.all(batch.map(({ ef, c }) => SA.fetchApi('GetStudyGroups', {
                aFacultyID: facultyId,
                aEducationForm: ef,
                aCourse: c
            }, { useCache: false })));

            responses.forEach((data) => {
                const groups = (data && data.studyGroups) ? data.studyGroups : [];
                all.push(...groups);
            });
        }

        const seen = new Set();
        const unique = [];
        all.forEach((g) => {
            const key = String(g.Key || '');
            if (!key || seen.has(key)) return;
            seen.add(key);
            unique.push(g);
        });
        return unique;
    }

    async function fetchFacultySchedule(groups, startDmy, endDmy) {
        const allRows = [];
        let done = 0;

        for (const batch of chunk(groups, 6)) {
            const responses = await Promise.all(batch.map((g) => SA.fetchApi('GetScheduleDataX', {
                aStudyGroupID: String(g.Key || ''),
                aStartDate: startDmy,
                aEndDate: endDmy,
                aStudyTypeID: ''
            }, { useCache: false, silent: true })));

            responses.forEach((rows, idx) => {
                const g = batch[idx];
                const name = String(g.Value || g.Key || '');
                if (Array.isArray(rows)) {
                    rows.forEach((r) => allRows.push(normalizeLesson(r, name)));
                }
                done += 1;
            });

            setStatus(`Факультет: завантажено ${done}/${groups.length} груп...`);
        }

        return allRows.filter(Boolean);
    }

    async function buildWeekSchedule() {
        if (!els.facultySelect.value) {
            setStatus('Оберіть факультет', true);
            return;
        }
        if (state.mode !== 'faculty' && !els.entitySelect.value) {
            state.mode = 'faculty';
            if (els.modeSelect) els.modeSelect.value = 'faculty';
            setModeUI();
            setStatus('Автоматично увімкнено режим факультету. Запускаю збір...');
        }
        if (!els.weekStart.value || !els.weekEnd.value) {
            setStatus('Оберіть коректний діапазон дат', true);
            return;
        }

        buildWeekDays();
        const startDmy = toDmyIso(els.weekStart.value);
        const endDmy = toDmyIso(els.weekEnd.value);
        const weekDmySet = new Set(state.weekDays.map((d) => d.dmy));

        if (state.mode === 'faculty') {
            setStatus('Збір всіх груп факультету...');
            const groups = await fetchAllFacultyGroups(els.facultySelect.value);
            state.lastSourceCount = groups.length;
            if (!groups.length) {
                state.normalized = [];
                renderTable(state.normalized);
                setStatus('Для цього факультету не знайдено груп', true);
                return;
            }

            const rows = await fetchFacultySchedule(groups, startDmy, endDmy);
            state.normalized = rows.filter((l) => l && weekDmySet.has(l.date));
            renderTable(state.normalized);
            setStatus(`Готово: факультет, груп ${groups.length}, занять ${state.normalized.length}`);
            return;
        }

        const entityId = els.entitySelect.value;
        const payload = { aStartDate: startDmy, aEndDate: endDmy, aStudyTypeID: '' };
        const action = state.mode === 'group' ? 'GetScheduleDataX' : 'GetScheduleDataEmp';
        if (state.mode === 'group') payload.aStudyGroupID = entityId;
        else payload.aEmployeeID = entityId;

        setStatus('Парсинг API та автозбірка тижневого розкладу...');
        const data = await SA.fetchApi(action, payload, { useCache: false });
        if (!Array.isArray(data)) {
            setStatus('Не вдалося завантажити розклад', true);
            return;
        }

        state.lastSourceCount = 1;
        state.normalized = data.map((x) => normalizeLesson(x, '')).filter((l) => l && weekDmySet.has(l.date));
        renderTable(state.normalized);
        setStatus(`Готово: зібрано ${state.normalized.length} занять за тиждень`);
    }

    function bind() {
        els.modeSelect.addEventListener('change', async () => {
            state.mode = els.modeSelect.value;
            setModeUI();
            if (state.mode === 'group') await loadGroups();
            else if (state.mode === 'teacher') await loadChairs();
            else setStatus('Режим факультету: виберіть факультет і натисніть Зібрати');
        });

        els.facultySelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
            else if (state.mode === 'teacher') await loadChairs();
        });

        els.eduFormSelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
        });

        els.courseSelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
        });

        els.chairSelect.addEventListener('change', loadEmployees);
        els.prevWeekBtn.addEventListener('click', () => shiftWeek(-1));
        els.nextWeekBtn.addEventListener('click', () => shiftWeek(1));
        els.buildBtn.addEventListener('click', buildWeekSchedule);
        if (els.buildBtnPrimary) els.buildBtnPrimary.addEventListener('click', buildWeekSchedule);
    }

    async function init() {
        setCurrentWeek();
        bind();
        setModeUI();
        await loadBaseFilters();
        await loadGroups();
    }

    init().catch((e) => setStatus(`Помилка ініціалізації: ${e.message}`, true));
})(window.ScheduleApp);
