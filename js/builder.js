window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const DAY_NAMES = ['Р СџР Р…', 'Р вЂ™РЎвЂљ', 'Р РЋРЎР‚', 'Р В§РЎвЂљ', 'Р СџРЎвЂљ'];
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
        lastSourceCount: 0,
        baselineNormalized: [],
        optimizedNormalized: [],
        loadedFacultyKey: '',
        parseCounter: 0,
        teacherIdByName: {},
        teacherScheduleCache: {},
        teacherIndexFacultyKey: '',
        currentViewLabel: 'Р В±Р В°Р В·Р С•Р Р†Р С‘Р в„–'
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
        optimizedTableSection: document.getElementById('optimizedTableSection'),
        optimizedTableHead: document.getElementById('optimizedTableHead'),
        optimizedTableBody: document.getElementById('optimizedTableBody'),
        dataModeBadge: document.getElementById('dataModeBadge'),
        sumLessons: document.getElementById('sumLessons'),
        sumDays: document.getElementById('sumDays'),
        sumConflicts: document.getElementById('sumConflicts'),
        sumDuplicates: document.getElementById('sumDuplicates'),
        sumSources: document.getElementById('sumSources'),
        groupsTableSection: document.getElementById('groupsTableSection'),
        groupsDaySelect: document.getElementById('groupsDaySelect'),
        groupsFilterInput: document.getElementById('groupsFilterInput'),
        groupsApplyBtn: document.getElementById('groupsApplyBtn'),
        groupsTableMeta: document.getElementById('groupsTableMeta'),
        groupsTableHead: document.getElementById('groupsTableHead'),
        groupsTableBody: document.getElementById('groupsTableBody'),
        optimizationSection: document.getElementById('optimizationSection'),
        runOptimizationBtn: document.getElementById('runOptimizationBtn'),
        optAvgWindows: document.getElementById('optAvgWindows'),
        optNoFirstPairGroups: document.getElementById('optNoFirstPairGroups'),
        optMaxWindowsGroup: document.getElementById('optMaxWindowsGroup'),
        optTableHead: document.getElementById('optTableHead'),
        optTableBody: document.getElementById('optTableBody'),
        optMoves: document.getElementById('optMoves')
    };

    function setStatus(msg, isError) {
        els.status.textContent = msg;
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-500';
    }

    function setDataModeBadge(text, isOptimized) {
        state.currentViewLabel = text;
        if (!els.dataModeBadge) return;
        els.dataModeBadge.textContent = `Р В Р ВµР В¶Р С‘Р С: ${text}`;
        els.dataModeBadge.className = isOptimized
            ? 'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
            : 'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100';
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

    function dayNameByDateDmy(dmy) {
        const d = parseDmy(dmy);
        if (!d) return dmy || '';
        const names = ['Р СњР ВµР Т‘РЎвЂ“Р В»РЎРЏ', 'Р СџР С•Р Р…Р ВµР Т‘РЎвЂ“Р В»Р С•Р С”', 'Р вЂ™РЎвЂ“Р Р†РЎвЂљР С•РЎР‚Р С•Р С”', 'Р РЋР ВµРЎР‚Р ВµР Т‘Р В°', 'Р В§Р ВµРЎвЂљР Р†Р ВµРЎР‚', "Р Сџ'РЎРЏРЎвЂљР Р…Р С‘РЎвЂ РЎРЏ", 'Р РЋРЎС“Р В±Р С•РЎвЂљР В°'];
        return names[d.getDay()] || dmy || '';
    }

    function normalizeTeacherName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/\./g, '')
            .replace(/\s+/g, ' ')
            .trim();
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
            id: `L${++state.parseCounter}`,
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

        if (isGroup) els.entitySelect.innerHTML = '<option value="">Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ Р С–РЎР‚РЎС“Р С—РЎС“...</option>';
        else if (isTeacher) els.entitySelect.innerHTML = '<option value="">Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ Р Р†Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎР В°...</option>';
        else els.entitySelect.innerHTML = '<option value="">Р Р€ РЎР‚Р ВµР В¶Р С‘Р СРЎвЂ“ РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљРЎС“ Р Р†Р С‘Р В±РЎвЂ“РЎР‚ Р Р…Р Вµ Р С—Р С•РЎвЂљРЎР‚РЎвЂ“Р В±Р ВµР Р…</option>';
    }

    async function loadBaseFilters() {
        setStatus('Р вЂ”Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р ВµР Р…Р Р…РЎРЏ РЎвЂћРЎвЂ“Р В»РЎРЉРЎвЂљРЎР‚РЎвЂ“Р Р†...');
        const data = await SA.fetchApi('GetStudentScheduleFiltersData', {}, { useCache: false });
        if (!data) {
            setStatus('Р СњР Вµ Р Р†Р Т‘Р В°Р В»Р С•РЎРѓРЎРЏ Р В·Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р С‘РЎвЂљР С‘ РЎвЂћРЎвЂ“Р В»РЎРЉРЎвЂљРЎР‚Р С‘', true);
            return;
        }
        state.faculties = data.faculties || [];
        state.eduForms = data.educForms || [];
        state.courses = data.courses || [];
        fillSelect(els.facultySelect, state.faculties, 'Value', 'Key', true);
        fillSelect(els.eduFormSelect, state.eduForms, 'Value', 'Key', true);
        fillSelect(els.courseSelect, state.courses, 'Value', 'Key', true);
        setStatus('Р В¤РЎвЂ“Р В»РЎРЉРЎвЂљРЎР‚Р С‘ Р С–Р С•РЎвЂљР С•Р Р†РЎвЂ“');
    }

    async function loadGroups() {
        if (!els.facultySelect.value) return;
        setStatus('Р вЂ”Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р ВµР Р…Р Р…РЎРЏ Р С–РЎР‚РЎС“Р С—...');
        const data = await SA.fetchApi('GetStudyGroups', {
            aFacultyID: els.facultySelect.value,
            aEducationForm: els.eduFormSelect.value || '0',
            aCourse: els.courseSelect.value || '0'
        }, { useCache: false });
        state.entities = (data && data.studyGroups) ? data.studyGroups : [];
        fillSelect(els.entitySelect, state.entities, 'Value', 'Key', false);
        setStatus(`Р вЂ”Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С• Р С–РЎР‚РЎС“Р С—: ${state.entities.length}`);
    }

    async function loadChairs() {
        if (!els.facultySelect.value) return;
        setStatus('Р вЂ”Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р ВµР Р…Р Р…РЎРЏ Р С”Р В°РЎвЂћР ВµР Т‘РЎР‚...');
        const data = await SA.fetchApi('GetEmployeeChairs', { aFacultyID: els.facultySelect.value }, { useCache: false });
        state.chairs = (data && data.chairs) ? data.chairs : [];
        fillSelect(els.chairSelect, state.chairs, 'Value', 'Key', true);
        if (els.chairSelect.value) await loadEmployees();
    }

    async function loadEmployees() {
        if (!els.facultySelect.value || !els.chairSelect.value) return;
        setStatus('Р вЂ”Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р ВµР Р…Р Р…РЎРЏ Р Р†Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎРЎвЂ“Р Р†...');
        const data = await SA.fetchApi('GetEmployees', {
            aFacultyID: els.facultySelect.value,
            aChairID: els.chairSelect.value
        }, { useCache: false });
        state.entities = Array.isArray(data) ? data : [];
        fillSelect(els.entitySelect, state.entities, 'Value', 'Key', false);
        setStatus(`Р вЂ”Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С• Р Р†Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎРЎвЂ“Р Р†: ${state.entities.length}`);
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
        trHead.innerHTML = `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р СџР В°РЎР‚Р В°</th>${
            state.weekDays.map((d) => `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">${d.label}</th>`).join('')
        }`;
        els.tableHead.appendChild(trHead);

        let conflictSlots = 0;
        const trueConflictKeys = new Set();
        PAIRS.forEach((pair) => {
            const tr = document.createElement('tr');
            let row = `<td class="p-2 border dark:border-gray-700 font-bold align-top">${pair} Р С—Р В°РЎР‚Р В°</td>`;

            state.weekDays.forEach((day) => {
                const cellKey = `${day.dow}-${pair}`;
                const rawItems = map.get(cellKey) || [];
                if (state.mode === 'faculty') {
                    const byGroup = new Map();
                    rawItems.forEach((it) => {
                        const g = String(it.group || it.sourceName || '').trim();
                        if (!g) return;
                        if (!byGroup.has(g)) byGroup.set(g, 0);
                        byGroup.set(g, byGroup.get(g) + 1);
                    });
                    byGroup.forEach((count, g) => {
                        if (count > 1) trueConflictKeys.add(`${day.dow}-${pair}-${g}`);
                    });
                } else if (rawItems.length > 1) {
                    conflictSlots += 1;
                }

                const items = (state.mode === 'faculty')
                    ? (() => {
                        const merged = new Map();
                        rawItems.forEach((it) => {
                            const mergeKey = [
                                it.date || '',
                                it.pair || '',
                                it.discipline || '',
                                it.teacher || '',
                                it.type || '',
                                it.room || '',
                                it.start || '',
                                it.end || ''
                            ].join('||');
                            if (!merged.has(mergeKey)) {
                                merged.set(mergeKey, {
                                    ...it,
                                    groupsList: []
                                });
                            }
                            const ref = merged.get(mergeKey);
                            const g = String(it.group || it.sourceName || '').trim();
                            if (g && !ref.groupsList.includes(g)) ref.groupsList.push(g);
                        });
                        return Array.from(merged.values());
                    })()
                    : rawItems;

                const chipHtml = items.map((it) => {
                    let subtitle = '';
                    if (state.mode === 'group') {
                        subtitle = it.teacher || 'Р вЂ™Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎ Р Р…Р Вµ Р Р†Р С”Р В°Р В·Р В°Р Р…Р С‘Р в„–';
                    } else if (state.mode === 'teacher') {
                        subtitle = it.group || it.sourceName || 'Р вЂњРЎР‚РЎС“Р С—Р В° Р Р…Р Вµ Р Р†Р С”Р В°Р В·Р В°Р Р…Р В°';
                    } else {
                        const groups = Array.isArray(it.groupsList) ? it.groupsList : [it.group || it.sourceName || 'Р вЂњРЎР‚РЎС“Р С—Р В° ?'];
                        const groupsText = groups.join(', ');
                        subtitle = `${groups.length > 1 ? 'Р СџР С•РЎвЂљРЎвЂ“Р С”' : 'Р вЂњРЎР‚РЎС“Р С—Р В°'}: ${groupsText} Р’В· ${it.teacher || 'Р вЂ™Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎ ?'}`;
                    }

                    const timeText = (it.start && it.end) ? `${it.start}-${it.end}` : '';
                    return `
                        <div class="lesson-chip ${items.length > 1 ? 'lesson-conflict' : ''} bg-gray-50 dark:bg-gray-700 rounded p-2 mb-2 last:mb-0">
                            <div class="font-semibold">${it.discipline || 'Р вЂР ВµР В· Р Р…Р В°Р В·Р Р†Р С‘'}</div>
                            <div class="text-xs text-gray-500">${subtitle}</div>
                            <div class="text-xs text-gray-500">${it.type || 'Р СћР С‘Р С— Р Р…Р Вµ Р Р†Р С”Р В°Р В·Р В°Р Р…Р С•'} Р’В· ${it.room || 'РІР‚вЂќ'} ${timeText ? `Р’В· ${timeText}` : ''}</div>
                        </div>
                    `;
                }).join('');

                row += `<td class="slot-cell p-2 border dark:border-gray-700">${chipHtml || '<span class="text-xs text-gray-400">РІР‚вЂќ</span>'}</td>`;
            });

            tr.innerHTML = row;
            els.tableBody.appendChild(tr);
        });

        const activeDays = state.weekDays.filter((day) => PAIRS.some((pair) => (map.get(`${day.dow}-${pair}`) || []).length > 0)).length;
        if (state.mode === 'faculty') conflictSlots = trueConflictKeys.size;

        els.sumLessons.textContent = String(lessons.length);
        els.sumDays.textContent = String(activeDays);
        els.sumConflicts.textContent = String(conflictSlots);
        els.sumDuplicates.textContent = String(duplicates);
        els.sumSources.textContent = String(state.lastSourceCount || 0);
    }

    function renderOptimizedTable(lessons) {
        if (!els.optimizedTableSection || !els.optimizedTableHead || !els.optimizedTableBody) return;
        const map = new Map();
        lessons.forEach((l) => {
            if (!l || !l.pair) return;
            const key = `${l.dow}-${l.pair}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(l);
        });

        els.optimizedTableHead.innerHTML = '';
        els.optimizedTableBody.innerHTML = '';
        const trHead = document.createElement('tr');
        trHead.innerHTML = `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р СџР В°РЎР‚Р В°</th>${
            state.weekDays.map((d) => `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">${d.label}</th>`).join('')
        }`;
        els.optimizedTableHead.appendChild(trHead);

        PAIRS.forEach((pair) => {
            const tr = document.createElement('tr');
            let row = `<td class="p-2 border dark:border-gray-700 font-bold align-top">${pair} Р С—Р В°РЎР‚Р В°</td>`;
            state.weekDays.forEach((day) => {
                const rawItems = map.get(`${day.dow}-${pair}`) || [];
                const merged = new Map();
                rawItems.forEach((it) => {
                    const mergeKey = [
                        it.date || '',
                        it.pair || '',
                        it.discipline || '',
                        it.teacher || '',
                        it.type || '',
                        it.room || '',
                        it.start || '',
                        it.end || ''
                    ].join('||');
                    if (!merged.has(mergeKey)) merged.set(mergeKey, { ...it, groupsList: [] });
                    const ref = merged.get(mergeKey);
                    const g = String(it.group || it.sourceName || '').trim();
                    if (g && !ref.groupsList.includes(g)) ref.groupsList.push(g);
                });
                const items = Array.from(merged.values());
                const chipHtml = items.map((it) => {
                    const groups = Array.isArray(it.groupsList) ? it.groupsList : [it.group || it.sourceName || 'Р вЂњРЎР‚РЎС“Р С—Р В° ?'];
                    const subtitle = `${groups.length > 1 ? 'Р СџР С•РЎвЂљРЎвЂ“Р С”' : 'Р вЂњРЎР‚РЎС“Р С—Р В°'}: ${groups.join(', ')} Р’В· ${it.teacher || 'Р вЂ™Р С‘Р С”Р В»Р В°Р Т‘Р В°РЎвЂЎ ?'}`;
                    const timeText = (it.start && it.end) ? `${it.start}-${it.end}` : '';
                    return `
                        <div class="lesson-chip bg-gray-50 dark:bg-gray-700 rounded p-2 mb-2 last:mb-0">
                            <div class="font-semibold">${it.discipline || 'Р вЂР ВµР В· Р Р…Р В°Р В·Р Р†Р С‘'}</div>
                            <div class="text-xs text-gray-500">${subtitle}</div>
                            <div class="text-xs text-gray-500">${it.type || 'Р СћР С‘Р С— Р Р…Р Вµ Р Р†Р С”Р В°Р В·Р В°Р Р…Р С•'} Р’В· ${it.room || 'РІР‚вЂќ'} ${timeText ? `Р’В· ${timeText}` : ''}</div>
                        </div>
                    `;
                }).join('');
                row += `<td class="slot-cell p-2 border dark:border-gray-700">${chipHtml || '<span class="text-xs text-gray-400">РІР‚вЂќ</span>'}</td>`;
            });
            tr.innerHTML = row;
            els.optimizedTableBody.appendChild(tr);
        });

        els.optimizedTableSection.classList.remove('hidden');
    }

    function getWeekDayByDow(dow) {
        return (state.weekDays || []).find((d) => d.dow === dow) || null;
    }

    function parseGroupsFilter(raw) {
        const s = String(raw || '').trim();
        if (!s) return [];
        return s
            .split(',')
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean);
    }

    function renderGroupsTable() {
        if (!els.groupsTableSection) return;
        const isFaculty = state.mode === 'faculty';
        els.groupsTableSection.classList.toggle('hidden', !isFaculty);
        if (!isFaculty) return;

        const dayDow = parseInt(els.groupsDaySelect.value || '1', 10);
        const rowsForDay = state.normalized.filter((l) => l && l.dow === dayDow);
        const allGroups = Array.from(new Set(rowsForDay.map((l) => String(l.group || l.sourceName || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
        const filterParts = parseGroupsFilter(els.groupsFilterInput.value);
        let groups = allGroups;
        if (filterParts.length) {
            groups = allGroups.filter((g) => filterParts.some((f) => g.toLowerCase().includes(f)));
        }
        const MAX_GROUPS = 24;
        const trimmed = groups.slice(0, MAX_GROUPS);

        const matrix = new Map();
        rowsForDay.forEach((l) => {
            const g = String(l.group || l.sourceName || '').trim();
            if (!trimmed.includes(g)) return;
            const key = `${l.pair}||${g}`;
            if (!matrix.has(key)) matrix.set(key, []);
            matrix.get(key).push(l);
        });

        els.groupsTableHead.innerHTML = '';
        els.groupsTableBody.innerHTML = '';
        const th = document.createElement('tr');
        th.innerHTML = `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р СџР В°РЎР‚Р В°</th>${trimmed.map((g) => `<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">${g}</th>`).join('')}`;
        els.groupsTableHead.appendChild(th);

        PAIRS.forEach((pair) => {
            const tr = document.createElement('tr');
            let row = `<td class="p-2 border dark:border-gray-700 font-bold">${pair} Р С—Р В°РЎР‚Р В°</td>`;
            trimmed.forEach((g) => {
                const cell = matrix.get(`${pair}||${g}`) || [];
                const text = cell.map((x) => `${x.discipline || 'РІР‚вЂќ'}${x.room ? ` (${x.room})` : ''}`).join(' / ');
                row += `<td class="p-2 border dark:border-gray-700 text-xs">${text || 'РІР‚вЂќ'}</td>`;
            });
            tr.innerHTML = row;
            els.groupsTableBody.appendChild(tr);
        });

        const dayObj = getWeekDayByDow(dayDow);
        els.groupsTableMeta.textContent = `Р вЂќР ВµР Р…РЎРЉ: ${dayObj ? dayObj.label : dayDow}. Р вЂњРЎР‚РЎС“Р С— РЎС“ РЎвЂљР В°Р В±Р В»Р С‘РЎвЂ РЎвЂ“: ${trimmed.length}${groups.length > MAX_GROUPS ? ` (Р С—Р С•Р С”Р В°Р В·Р В°Р Р…Р С• Р С—Р ВµРЎР‚РЎв‚¬РЎвЂ“ ${MAX_GROUPS})` : ''}.`;
    }

    function computeGroupWindows(dayLessons) {
        const pairs = [...new Set(dayLessons.map((x) => x.pair).filter(Boolean))].sort((a, b) => a - b);
        if (!pairs.length) return { windows: 0, firstPair: 0 };
        let windows = 0;
        for (let i = 1; i < pairs.length; i++) {
            const gap = pairs[i] - pairs[i - 1] - 1;
            if (gap > 0) windows += gap;
        }
        return { windows, firstPair: pairs[0] };
    }

    function getWindowsSummary(lessons) {
        const byGroup = new Map();
        lessons.forEach((l) => {
            const g = String(l.group || l.sourceName || '').trim();
            if (!g) return;
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g).push(l);
        });

        const stats = [];
        byGroup.forEach((rows, group) => {
            const byDay = new Map();
            rows.forEach((r) => {
                if (!byDay.has(r.date)) byDay.set(r.date, []);
                byDay.get(r.date).push(r);
            });

            let windowsWeek = 0;
            let noFirstPairDays = 0;
            byDay.forEach((dayRows) => {
                const info = computeGroupWindows(dayRows);
                windowsWeek += info.windows;
                if (info.firstPair > 1) noFirstPairDays += 1;
            });

            stats.push({ group, windowsWeek, noFirstPairDays, rows, byDay });
        });

        return stats;
    }

    async function ensureTeacherIndexForSelectedFaculty() {
        const facultyId = String(els.facultySelect.value || '');
        if (!facultyId) return;
        if (state.teacherIndexFacultyKey === facultyId && Object.keys(state.teacherIdByName).length > 0) return;

        state.teacherIdByName = {};
        state.teacherScheduleCache = {};
        state.teacherIndexFacultyKey = facultyId;

        const c = await SA.fetchApi('GetEmployeeChairs', { aFacultyID: facultyId }, { useCache: true, silent: true });
        const chairs = (c && c.chairs) ? c.chairs : [];
        for (const chair of chairs) {
            const emps = await SA.fetchApi('GetEmployees', {
                aFacultyID: facultyId,
                aChairID: String(chair.Key || '')
            }, { useCache: true, silent: true });
            const arr = Array.isArray(emps) ? emps : [];
            arr.forEach((e) => {
                const n = normalizeTeacherName(e.Value || '');
                if (n && !state.teacherIdByName[n]) {
                    state.teacherIdByName[n] = String(e.Key || '');
                }
            });
        }
    }

    async function getTeacherBusyMap(teacherName) {
        const keyName = normalizeTeacherName(teacherName);
        if (!keyName) return null;
        if (state.teacherScheduleCache[keyName]) return state.teacherScheduleCache[keyName];
        const teacherId = state.teacherIdByName[keyName];
        if (!teacherId) return null;

        const startDmy = toDmyIso(els.weekStart.value);
        const endDmy = toDmyIso(els.weekEnd.value);
        const rows = await SA.fetchApi('GetScheduleDataEmp', {
            aEmployeeID: teacherId,
            aStartDate: startDmy,
            aEndDate: endDmy,
            aStudyTypeID: ''
        }, { useCache: true, silent: true });

        const busy = new Set();
        (Array.isArray(rows) ? rows : []).forEach((r) => {
            const p = parsePair(r);
            const d = String(r.full_date || '');
            if (d && p) busy.add(`${d}||${p}`);
        });
        state.teacherScheduleCache[keyName] = busy;
        return busy;
    }

    async function renderOptimizationReport(baseLessons, optimizedLessons) {
        if (!els.optimizationSection) return;
        const isFaculty = state.mode === 'faculty';
        els.optimizationSection.classList.toggle('hidden', !isFaculty);
        if (!isFaculty) return;
        const current = Array.isArray(baseLessons) ? baseLessons : state.baselineNormalized;
        const optimized = Array.isArray(optimizedLessons) ? optimizedLessons : optimizeFacultySchedule(current);
        const stats = getWindowsSummary(current).map((x) => {
            const byDay = x.byDay;
            const avgStart = byDay.size
                ? (Array.from(byDay.values()).reduce((s, dayRows) => s + (computeGroupWindows(dayRows).firstPair || 0), 0) / byDay.size)
                : 0;
            return {
                group: x.group,
                windowsWeek: x.windowsWeek,
                noFirstPairDays: x.noFirstPairDays,
                avgStart: avgStart ? avgStart.toFixed(2) : '0.00',
                suggestion: x.windowsWeek >= 3
                    ? 'Р Р€РЎвЂ°РЎвЂ“Р В»РЎРЉР Р…Р С‘РЎвЂљР С‘ Р С—Р В°РЎР‚Р С‘ Р Р† Р СР ВµР В¶Р В°РЎвЂ¦ Р Т‘Р Р…РЎРЏ (Р В·Р СР ВµР Р…РЎв‚¬Р С‘РЎвЂљР С‘ Р Р†РЎвЂ“Р С”Р Р…Р В°)'
                    : (x.noFirstPairDays >= 3 ? 'Р СџР ВµРЎР‚Р ВµР Р†РЎвЂ“РЎР‚Р С‘РЎвЂљР С‘ Р СР С•Р В¶Р В»Р С‘Р Р†РЎвЂ“РЎРѓРЎвЂљРЎРЉ РЎРѓРЎвЂљР В°РЎР‚РЎвЂљРЎС“ Р В· 1-2 Р С—Р В°РЎР‚Р С‘' : 'Р В Р С•Р В·Р С”Р В»Р В°Р Т‘ Р В±Р В»Р С‘Р В·РЎРЉР С”Р С‘Р в„– Р Т‘Р С• Р С•Р С—РЎвЂљР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р С–Р С•')
            };
        });

        stats.sort((a, b) => b.windowsWeek - a.windowsWeek || b.noFirstPairDays - a.noFirstPairDays || a.group.localeCompare(b.group, 'uk'));

        const avgWindows = stats.length
            ? (stats.reduce((s, x) => s + x.windowsWeek, 0) / stats.length).toFixed(2)
            : '0.00';
        const noFirstPairGroups = stats.filter((x) => x.noFirstPairDays > 0).length;
        const max = stats[0];

        els.optAvgWindows.textContent = String(avgWindows);
        els.optNoFirstPairGroups.textContent = String(noFirstPairGroups);
        els.optMaxWindowsGroup.textContent = max ? `${max.group} (${max.windowsWeek})` : 'РІР‚вЂќ';

        els.optTableHead.innerHTML = '<tr>' +
            '<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р вЂњРЎР‚РЎС“Р С—Р В°</th>' +
            '<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р вЂ™РЎвЂ“Р С”Р Р…Р В°/РЎвЂљР С‘Р В¶Р Т‘Р ВµР Р…РЎРЉ</th>' +
            '<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р вЂќР Р…РЎвЂ“Р Р† Р В±Р ВµР В· 1-РЎвЂ” Р С—Р В°РЎР‚Р С‘</th>' +
            '<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р РЋР ВµРЎР‚. РЎРѓРЎвЂљР В°РЎР‚РЎвЂљ Р С—Р В°РЎР‚Р С‘</th>' +
            '<th class="p-2 border dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-left">Р В Р ВµР С”Р С•Р СР ВµР Р…Р Т‘Р В°РЎвЂ РЎвЂ“РЎРЏ</th>' +
            '</tr>';
        els.optTableBody.innerHTML = '';

        stats.slice(0, 40).forEach((x) => {
            const tr = document.createElement('tr');
            tr.innerHTML =
                `<td class="p-2 border dark:border-gray-700 font-semibold">${x.group}</td>` +
                `<td class="p-2 border dark:border-gray-700">${x.windowsWeek}</td>` +
                `<td class="p-2 border dark:border-gray-700">${x.noFirstPairDays}</td>` +
                `<td class="p-2 border dark:border-gray-700">${x.avgStart}</td>` +
                `<td class="p-2 border dark:border-gray-700 text-xs">${x.suggestion}</td>`;
            els.optTableBody.appendChild(tr);
        });

        if (!els.optMoves) return;
        els.optMoves.innerHTML = '';
        if (!optimized || !optimized.length) {
            els.optMoves.textContent = 'Р СњР Вµ Р Р†Р Т‘Р В°Р В»Р С•РЎРѓРЎРЏ Р В·Р С–Р ВµР Р…Р ВµРЎР‚РЎС“Р Р†Р В°РЎвЂљР С‘ Р С”Р С•Р Р…Р С”РЎР‚Р ВµРЎвЂљР Р…РЎвЂ“ Р С”РЎР‚Р С•Р С”Р С‘.';
            return;
        }

        const baseById = new Map(current.map((x) => [x.id, x]));
        const moves = [];
        optimized.forEach((x) => {
            const b = baseById.get(x.id);
            if (!b) return;
            if (b.pair !== x.pair) {
                moves.push({ group: x.group, date: x.date, discipline: x.discipline, from: b.pair, to: x.pair });
            }
        });
        if (!moves.length) {
            els.optMoves.textContent = 'Р Р‡Р Р†Р Р…Р С‘РЎвЂ¦ Р С—Р ВµРЎР‚Р ВµР Р…Р С•РЎРѓРЎвЂ“Р Р† Р Р…Р Вµ Р С—Р С•РЎвЂљРЎР‚РЎвЂ“Р В±Р Р…Р С• РІР‚вЂќ Р С—Р С•РЎвЂљР С•РЎвЂЎР Р…Р С‘Р в„– Р Р†Р В°РЎР‚РЎвЂ“Р В°Р Р…РЎвЂљ РЎС“Р В¶Р Вµ Р В±Р В»Р С‘Р В·РЎРЉР С”Р С‘Р в„– Р Т‘Р С• Р С•Р С—РЎвЂљР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р С–Р С•.';
            return;
        }

        const visibleMoves = moves
            .slice()
            .sort((a, b) => (a.group.localeCompare(b.group, 'uk') || a.date.localeCompare(b.date, 'uk')))
            .slice(0, 80);

        visibleMoves.forEach((m) => {
                const div = document.createElement('div');
                const dayName = dayNameByDateDmy(m.date);
                const lesson = (current.find((x) => x.group === m.group && x.date === m.date && x.discipline === m.discipline && x.pair === m.from) || {});
                const teacher = lesson.teacher ? `, Р Р†Р С‘Р С”Р В». ${lesson.teacher}` : '';
                div.textContent = `${m.group}: "${m.discipline}"${teacher} РІР‚вЂќ Р С—Р ВµРЎР‚Р ВµР Р…Р ВµРЎРѓРЎвЂљР С‘ Р Р…Р В° ${dayName} (${m.date}) Р В· ${m.from}-РЎвЂ” Р Р…Р В° ${m.to}-РЎС“ Р С—Р В°РЎР‚РЎС“`;
                els.optMoves.appendChild(div);
            });

        await ensureTeacherIndexForSelectedFaculty();
        let skippedBusy = 0;
        const allMoveEls = Array.from(els.optMoves.children);
        for (let i = 0; i < Math.min(visibleMoves.length, allMoveEls.length); i++) {
            const m = visibleMoves[i];
            const el = allMoveEls[i];
            const lesson = (current.find((x) => x.group === m.group && x.date === m.date && x.discipline === m.discipline && x.pair === m.from) || {});
            const tName = lesson.teacher || '';
            if (!tName) continue;
            const busy = await getTeacherBusyMap(tName);
            if (!busy) continue;
            const targetKey = `${m.date}||${m.to}`;
            if (busy.has(targetKey)) {
                skippedBusy += 1;
                el.remove();
            }
        }

        if (skippedBusy > 0) {
            const meta = document.createElement('div');
            meta.className = 'text-[11px] text-gray-500 mt-1';
            meta.textContent = `Відфільтровано рекомендацій через зайнятість викладачів: ${skippedBusy}.`;
            els.optMoves.appendChild(meta);
        }
    }

    function fillGroupsDaySelect() {
        if (!els.groupsDaySelect) return;
        els.groupsDaySelect.innerHTML = '';
        state.weekDays.forEach((d) => {
            const o = document.createElement('option');
            o.value = String(d.dow);
            o.textContent = d.label;
            els.groupsDaySelect.appendChild(o);
        });
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

            setStatus(`Р В¤Р В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљ: Р В·Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р ВµР Р…Р С• ${done}/${groups.length} Р С–РЎР‚РЎС“Р С—...`);
        }

        return allRows.filter(Boolean);
    }

    function optimizeFacultySchedule(lessons) {
        const byGroupDay = new Map();
        lessons.forEach((l) => {
            const key = `${l.group}||${l.date}`;
            if (!byGroupDay.has(key)) byGroupDay.set(key, []);
            byGroupDay.get(key).push(l);
        });

        const tasks = Array.from(byGroupDay.entries()).map(([key, arr]) => ({
            key,
            // New schedule is built from scratch: do not prioritize old pair numbers.
            lessons: arr.slice().sort((a, b) =>
                a.discipline.localeCompare(b.discipline, 'uk') ||
                a.teacher.localeCompare(b.teacher, 'uk') ||
                a.group.localeCompare(b.group, 'uk')
            )
        }));
        tasks.sort((a, b) => b.lessons.length - a.lessons.length);

        const occupancy = {};
        for (let d = 1; d <= 5; d++) {
            occupancy[d] = {};
            for (let p = 1; p <= 7; p++) occupancy[d][p] = 0;
        }

        const optimized = [];
        tasks.forEach((task) => {
            const dayDow = task.lessons[0].dow;
            const n = task.lessons.length;
            const maxStart = Math.max(1, 8 - n);
            let bestStart = 1;
            let bestCost = Infinity;
            for (let start = 1; start <= maxStart; start++) {
                let load = 0;
                for (let i = 0; i < n; i++) load += occupancy[dayDow][start + i] || 0;
                const earlyPenalty = (start - 1) * 2.5;
                const cost = load * 1.3 + earlyPenalty;
                if (cost < bestCost) {
                    bestCost = cost;
                    bestStart = start;
                }
            }

            task.lessons.forEach((l, idx) => {
                const np = bestStart + idx;
                const t = PAIR_TIMES[np] || {};
                const nl = { ...l, pair: np, start: t.start || l.start, end: t.end || l.end };
                optimized.push(nl);
                occupancy[dayDow][np] = (occupancy[dayDow][np] || 0) + 1;
            });
        });

        return optimized;
    }

    async function ensureFacultyLoaded() {
        const facultyId = els.facultySelect.value;
        const startDmy = toDmyIso(els.weekStart.value);
        const endDmy = toDmyIso(els.weekEnd.value);
        const key = `${facultyId}||${startDmy}||${endDmy}`;
        if (state.loadedFacultyKey === key && state.baselineNormalized.length) return;

        buildWeekDays();
        const weekDmySet = new Set(state.weekDays.map((d) => d.dmy));
        setStatus('Р вЂ”Р В±РЎвЂ“РЎР‚ Р Р†РЎРѓРЎвЂ“РЎвЂ¦ Р С–РЎР‚РЎС“Р С— РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљРЎС“...');
        const groups = await fetchAllFacultyGroups(facultyId);
        state.lastSourceCount = groups.length;
        if (!groups.length) {
            state.baselineNormalized = [];
            state.optimizedNormalized = [];
            state.normalized = [];
            state.loadedFacultyKey = key;
            return;
        }
        const rows = await fetchFacultySchedule(groups, startDmy, endDmy);
        state.baselineNormalized = rows.filter((l) => l && weekDmySet.has(l.date));
        state.optimizedNormalized = [];
        state.loadedFacultyKey = key;
    }

    async function runAuxiliaryAnalysis() {
        if (!els.facultySelect.value) {
            setStatus('Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљ', true);
            return;
        }
        state.mode = 'faculty';
        if (els.modeSelect) els.modeSelect.value = 'faculty';
        setModeUI();
        await ensureFacultyLoaded();
        state.normalized = state.baselineNormalized.slice();
        setDataModeBadge('Р В±Р В°Р В·Р С•Р Р†Р С‘Р в„– (Р В°Р Р…Р В°Р В»РЎвЂ“Р В·)', false);
        renderTable(state.normalized);
        if (els.optimizedTableSection) els.optimizedTableSection.classList.add('hidden');
        fillGroupsDaySelect();
        renderGroupsTable();
        await renderOptimizationReport(state.baselineNormalized, null);
        setStatus(`Р вЂќР С•Р С—Р С•Р СРЎвЂ“Р В¶Р Р…Р С‘Р в„– Р В°Р Р…Р В°Р В»РЎвЂ“Р В· Р С–Р С•РЎвЂљР С•Р Р†Р С‘Р в„–: ${state.normalized.length} Р В·Р В°Р Р…РЎРЏРЎвЂљРЎРЉ`);
    }

    async function buildOptimizedFacultySchedule() {
        if (!els.facultySelect.value) {
            setStatus('Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљ', true);
            return;
        }
        state.mode = 'faculty';
        if (els.modeSelect) els.modeSelect.value = 'faculty';
        setModeUI();
        await ensureFacultyLoaded();
        if (!state.baselineNormalized.length) {
            setStatus('Р вЂќР В»РЎРЏ РЎвЂ РЎРЉР С•Р С–Р С• РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљРЎС“ Р Р…Р Вµ Р В·Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С• Р Т‘Р В°Р Р…Р С‘РЎвЂ¦', true);
            return;
        }
        setStatus('Р вЂРЎС“Р Т‘РЎС“РЎР‹ Р Р…Р С•Р Р†Р С‘Р в„– Р С•Р С—РЎвЂљР С‘Р СРЎвЂ“Р В·Р С•Р Р†Р В°Р Р…Р С‘Р в„– РЎР‚Р С•Р В·Р С”Р В»Р В°Р Т‘...');
        state.optimizedNormalized = optimizeFacultySchedule(state.baselineNormalized);
        state.normalized = state.optimizedNormalized.slice();
        setDataModeBadge('Р Р…Р С•Р Р†Р С‘Р в„– Р С•Р С—РЎвЂљР С‘Р СРЎвЂ“Р В·Р С•Р Р†Р В°Р Р…Р С‘Р в„–', true);
        renderTable(state.normalized);
        renderOptimizedTable(state.optimizedNormalized);
        fillGroupsDaySelect();
        renderGroupsTable();
        await renderOptimizationReport(state.baselineNormalized, state.optimizedNormalized);

        const before = getWindowsSummary(state.baselineNormalized).reduce((s, x) => s + x.windowsWeek, 0);
        const after = getWindowsSummary(state.optimizedNormalized).reduce((s, x) => s + x.windowsWeek, 0);
        setStatus(`Р С›Р С—РЎвЂљР С‘Р СРЎвЂ“Р В·Р С•Р Р†Р В°Р Р…Р С‘Р в„– РЎР‚Р С•Р В·Р С”Р В»Р В°Р Т‘ Р С–Р С•РЎвЂљР С•Р Р†Р С‘Р в„–: Р Р†РЎвЂ“Р С”Р Р…Р В° ${before} РІвЂ вЂ™ ${after}`);
    }

    async function buildWeekSchedule() {
        if (state.mode === 'faculty') {
            await runAuxiliaryAnalysis();
            return;
        }
        if (!els.facultySelect.value) {
            setStatus('Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљ', true);
            return;
        }
        if (state.mode !== 'faculty' && !els.entitySelect.value) {
            state.mode = 'faculty';
            if (els.modeSelect) els.modeSelect.value = 'faculty';
            setModeUI();
            setStatus('Р С’Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР Р…Р С• РЎС“Р Р†РЎвЂ“Р СР С”Р Р…Р ВµР Р…Р С• РЎР‚Р ВµР В¶Р С‘Р С РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљРЎС“. Р вЂ”Р В°Р С—РЎС“РЎРѓР С”Р В°РЎР‹ Р В·Р В±РЎвЂ“РЎР‚...');
        }
        if (!els.weekStart.value || !els.weekEnd.value) {
            setStatus('Р С›Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ Р С”Р С•РЎР‚Р ВµР С”РЎвЂљР Р…Р С‘Р в„– Р Т‘РЎвЂ“Р В°Р С—Р В°Р В·Р С•Р Р… Р Т‘Р В°РЎвЂљ', true);
            return;
        }

        buildWeekDays();
        const startDmy = toDmyIso(els.weekStart.value);
        const endDmy = toDmyIso(els.weekEnd.value);
        const weekDmySet = new Set(state.weekDays.map((d) => d.dmy));

        if (state.mode === 'faculty') {
            await runAuxiliaryAnalysis();
            return;
        }

        const entityId = els.entitySelect.value;
        const payload = { aStartDate: startDmy, aEndDate: endDmy, aStudyTypeID: '' };
        const action = state.mode === 'group' ? 'GetScheduleDataX' : 'GetScheduleDataEmp';
        if (state.mode === 'group') payload.aStudyGroupID = entityId;
        else payload.aEmployeeID = entityId;

        setStatus('Р СџР В°РЎР‚РЎРѓР С‘Р Р…Р С– API РЎвЂљР В° Р В°Р Р†РЎвЂљР С•Р В·Р В±РЎвЂ“РЎР‚Р С”Р В° РЎвЂљР С‘Р В¶Р Р…Р ВµР Р†Р С•Р С–Р С• РЎР‚Р С•Р В·Р С”Р В»Р В°Р Т‘РЎС“...');
        const data = await SA.fetchApi(action, payload, { useCache: false });
        if (!Array.isArray(data)) {
            setStatus('Р СњР Вµ Р Р†Р Т‘Р В°Р В»Р С•РЎРѓРЎРЏ Р В·Р В°Р Р†Р В°Р Р…РЎвЂљР В°Р В¶Р С‘РЎвЂљР С‘ РЎР‚Р С•Р В·Р С”Р В»Р В°Р Т‘', true);
            return;
        }

        state.lastSourceCount = 1;
        state.normalized = data.map((x) => normalizeLesson(x, '')).filter((l) => l && weekDmySet.has(l.date));
        setDataModeBadge('Р В±Р В°Р В·Р С•Р Р†Р С‘Р в„–', false);
        renderTable(state.normalized);
        if (els.groupsTableSection) els.groupsTableSection.classList.add('hidden');
        if (els.optimizationSection) els.optimizationSection.classList.add('hidden');
        if (els.optimizedTableSection) els.optimizedTableSection.classList.add('hidden');
        setStatus(`Р вЂњР С•РЎвЂљР С•Р Р†Р С•: Р В·РЎвЂ“Р В±РЎР‚Р В°Р Р…Р С• ${state.normalized.length} Р В·Р В°Р Р…РЎРЏРЎвЂљРЎРЉ Р В·Р В° РЎвЂљР С‘Р В¶Р Т‘Р ВµР Р…РЎРЉ`);
    }

    function bind() {
        els.modeSelect.addEventListener('change', async () => {
            state.mode = els.modeSelect.value;
            setModeUI();
            if (state.mode === 'group') await loadGroups();
            else if (state.mode === 'teacher') await loadChairs();
            else setStatus('Р В Р ВµР В¶Р С‘Р С РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљРЎС“: Р Р†Р С‘Р В±Р ВµРЎР‚РЎвЂ“РЎвЂљРЎРЉ РЎвЂћР В°Р С”РЎС“Р В»РЎРЉРЎвЂљР ВµРЎвЂљ РЎвЂ“ Р Р…Р В°РЎвЂљР С‘РЎРѓР Р…РЎвЂ“РЎвЂљРЎРЉ Р вЂ”РЎвЂ“Р В±РЎР‚Р В°РЎвЂљР С‘');
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
        if (els.groupsApplyBtn) els.groupsApplyBtn.addEventListener('click', renderGroupsTable);
        if (els.groupsDaySelect) els.groupsDaySelect.addEventListener('change', renderGroupsTable);
        if (els.runOptimizationBtn) els.runOptimizationBtn.addEventListener('click', runAuxiliaryAnalysis);
        if (els.buildBtnPrimary) {
            els.buildBtnPrimary.removeEventListener('click', buildWeekSchedule);
            els.buildBtnPrimary.addEventListener('click', buildOptimizedFacultySchedule);
        }
    }

    async function init() {
        setCurrentWeek();
        bind();
        setModeUI();
        await loadBaseFilters();
        await loadGroups();
    }

    init().catch((e) => setStatus(`Р СџР С•Р СР С‘Р В»Р С”Р В° РЎвЂ“Р Р…РЎвЂ“РЎвЂ РЎвЂ“Р В°Р В»РЎвЂ“Р В·Р В°РЎвЂ РЎвЂ“РЎвЂ”: ${e.message}`, true));
})(window.ScheduleApp);
