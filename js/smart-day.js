window.ScheduleApp = window.ScheduleApp || {};

(function (SA) {
    const PAIR_TIMES = SA.defaultTimes || {
        1: { start: '08:30', end: '09:50' },
        2: { start: '10:00', end: '11:20' },
        3: { start: '12:00', end: '13:20' },
        4: { start: '13:30', end: '14:50' },
        5: { start: '15:00', end: '16:20' },
        6: { start: '16:30', end: '17:50' },
        7: { start: '18:00', end: '19:20' }
    };

    const state = {
        mode: 'group',
        faculties: [],
        eduForms: [],
        courses: [],
        chairs: [],
        entities: [],
        selectedEntity: null,
        lessons: [],
        normalized: [],
        simBaseScore: 0,
        liveBoardEvents: [],
        prevStableMap: new Map(),
        currentAction: null,
        currentPayload: null,
        pollingTimer: null,
        clockTimer: null,
        boardMode: false
    };

    const els = {
        root: document.getElementById('smartRoot'),
        modeSelect: document.getElementById('modeSelect'),
        facultySelect: document.getElementById('facultySelect'),
        eduFormSelect: document.getElementById('eduFormSelect'),
        courseSelect: document.getElementById('courseSelect'),
        chairSelect: document.getElementById('chairSelect'),
        entitySelect: document.getElementById('entitySelect'),
        dateStart: document.getElementById('dateStart'),
        dateEnd: document.getElementById('dateEnd'),
        loadBtn: document.getElementById('loadBtn'),
        toggleBoardBtn: document.getElementById('toggleBoardBtn'),
        status: document.getElementById('status'),
        currentLesson: document.getElementById('currentLesson'),
        currentMeta: document.getElementById('currentMeta'),
        currentProgress: document.getElementById('currentProgress'),
        nextLesson: document.getElementById('nextLesson'),
        nextMeta: document.getElementById('nextMeta'),
        nextCountdown: document.getElementById('nextCountdown'),
        comfortScore: document.getElementById('comfortScore'),
        comfortMeta: document.getElementById('comfortMeta'),
        heatmap: document.getElementById('heatmap'),
        simLessonSelect: document.getElementById('simLessonSelect'),
        simAction: document.getElementById('simAction'),
        simRoom: document.getElementById('simRoom'),
        runSimBtn: document.getElementById('runSimBtn'),
        simResult: document.getElementById('simResult'),
        liveBoard: document.getElementById('liveBoard')
    };

    function setStatus(msg, isError) {
        els.status.textContent = msg;
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-500';
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function toDmyFromIso(iso) {
        const parts = String(iso || '').split('-');
        if (parts.length !== 3) return '';
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function parseDmy(dmy) {
        const parts = String(dmy || '').split('.');
        if (parts.length !== 3) return null;
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    }

    function parsePair(lesson) {
        const fromStudyTime = String(lesson.study_time || '').match(/(\d+)/);
        if (fromStudyTime) return parseInt(fromStudyTime[1], 10);
        for (let i = 1; i <= 7; i++) {
            const t = PAIR_TIMES[i];
            if (t && t.start === lesson.study_time_begin) return i;
        }
        return 0;
    }

    function normalizeLesson(raw) {
        const pair = parsePair(raw);
        const fallback = PAIR_TIMES[pair] || { start: raw.study_time_begin || '', end: raw.study_time_end || '' };
        return {
            raw,
            pair,
            date: String(raw.full_date || ''),
            discipline: String(raw.discipline || ''),
            type: String(raw.study_type || ''),
            teacher: SA.stripHtml(raw.teacher || raw.employee || ''),
            group: String(raw.contingent || raw.study_group || raw.groupName || ''),
            room: String(raw.cabinet || ''),
            start: String(raw.study_time_begin || fallback.start || ''),
            end: String(raw.study_time_end || fallback.end || ''),
            displayTime: String(raw.study_time || (pair ? `${pair} пара` : '')),
            entityName: state.selectedEntity ? state.selectedEntity.name : ''
        };
    }

    function lessonDateTime(dateDmy, hhmm) {
        if (!dateDmy || !hhmm) return null;
        const d = parseDmy(dateDmy);
        if (!d) return null;
        const [h, m] = hhmm.split(':').map(Number);
        d.setHours(h || 0, m || 0, 0, 0);
        return d;
    }

    function buildingKey(room) {
        const text = String(room || '').toLowerCase();
        const corp = text.match(/к\d+|корпус\s*\d+/i);
        if (corp) return corp[0];
        const slash = text.split('/');
        if (slash.length > 1 && slash[1]) return slash[1].trim();
        const num = text.match(/\d{2,4}/);
        if (num) return num[0].slice(0, 1);
        return text.slice(0, 4);
    }

    function computeComfortScore(lessons) {
        if (!lessons.length) return { score: 0, windows: 0, latePairs: 0, moves: 0 };

        const byDate = new Map();
        lessons.forEach((l) => {
            if (!byDate.has(l.date)) byDate.set(l.date, []);
            byDate.get(l.date).push(l);
        });

        let windows = 0;
        let latePairs = 0;
        let moves = 0;
        let overloadPenalty = 0;

        byDate.forEach((dayLessons) => {
            const pairs = [...new Set(dayLessons.map((x) => x.pair).filter(Boolean))].sort((a, b) => a - b);
            for (let i = 1; i < pairs.length; i++) {
                if (pairs[i] - pairs[i - 1] > 1) windows += (pairs[i] - pairs[i - 1] - 1);
            }

            latePairs += dayLessons.filter((x) => x.pair >= 6).length;
            overloadPenalty += Math.max(0, dayLessons.length - 4);

            const sorted = dayLessons.slice().sort((a, b) => a.pair - b.pair);
            for (let i = 1; i < sorted.length; i++) {
                const prev = buildingKey(sorted[i - 1].room);
                const cur = buildingKey(sorted[i].room);
                if (prev && cur && prev !== cur) moves += 1;
            }
        });

        const penalty = windows * 8 + latePairs * 5 + moves * 3 + overloadPenalty * 2;
        return {
            score: clamp(100 - penalty, 0, 100),
            windows,
            latePairs,
            moves
        };
    }

    function createCell(text, cls) {
        const div = document.createElement('div');
        div.className = cls || '';
        div.textContent = text;
        return div;
    }

    function renderHeatmap(lessons) {
        els.heatmap.innerHTML = '';
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
        const occupiedByDatePair = new Set();
        const dayOccurrences = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
        const grid = {};
        for (let d = 1; d <= 7; d++) {
            grid[d] = {};
            for (let p = 1; p <= 7; p++) grid[d][p] = 0;
        }

        const startRange = els.dateStart && els.dateStart.value ? new Date(`${els.dateStart.value}T00:00:00`) : null;
        const endRange = els.dateEnd && els.dateEnd.value ? new Date(`${els.dateEnd.value}T00:00:00`) : null;
        if (startRange && endRange && !Number.isNaN(startRange.getTime()) && !Number.isNaN(endRange.getTime()) && startRange <= endRange) {
            const cursor = new Date(startRange);
            while (cursor <= endRange) {
                const dow = cursor.getDay() === 0 ? 7 : cursor.getDay();
                dayOccurrences[dow] += 1;
                cursor.setDate(cursor.getDate() + 1);
            }
        }

        lessons.forEach((l) => {
            const dt = parseDmy(l.date);
            if (!dt || !l.pair) return;
            occupiedByDatePair.add(`${l.date}||${l.pair}`);
        });

        occupiedByDatePair.forEach((key) => {
            const [date, pairStr] = key.split('||');
            const dt = parseDmy(date);
            const pair = parseInt(pairStr, 10);
            if (!dt || !pair) return;
            const dow = dt.getDay() === 0 ? 7 : dt.getDay();
            grid[dow][pair] += 1;
        });

        els.heatmap.appendChild(createCell(''));
        for (let p = 1; p <= 7; p++) els.heatmap.appendChild(createCell(`${p} пара`, 'font-semibold'));

        for (let d = 1; d <= 7; d++) {
            els.heatmap.appendChild(createCell(dayNames[d - 1], 'font-semibold'));
            for (let p = 1; p <= 7; p++) {
                const occupied = grid[d][p];
                const totalDays = dayOccurrences[d] || 1;
                const ratio = occupied / totalDays;
                let cls = 'bg-gray-100 dark:bg-gray-700';
                if (ratio >= 0.67) cls = 'bg-red-200 dark:bg-red-900/40';
                else if (ratio >= 0.34) cls = 'bg-amber-200 dark:bg-amber-900/40';
                else if (ratio > 0) cls = 'bg-emerald-200 dark:bg-emerald-900/40';
                const cell = createCell(`${occupied}/${dayOccurrences[d] || 0}`, `heat-cell rounded text-center py-2 ${cls}`);
                cell.title = `Зайнято ${occupied} з ${dayOccurrences[d] || 0} днів (${Math.round(ratio * 100)}%)`;
                els.heatmap.appendChild(cell);
            }
        }
    }

    function renderSimLessonOptions(lessons) {
        els.simLessonSelect.innerHTML = '<option value="">Оберіть пару...</option>';
        lessons.forEach((l, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = `${l.date} · ${l.displayTime} · ${l.discipline}`;
            els.simLessonSelect.appendChild(opt);
        });
    }

    function updateSmartDayWidgets() {
        const now = new Date();
        let current = null;
        let next = null;
        let nextDiff = Infinity;

        state.normalized.forEach((l) => {
            const start = lessonDateTime(l.date, l.start);
            const end = lessonDateTime(l.date, l.end);
            if (!start || !end) return;

            if (now >= start && now < end && !current) {
                current = { l, start, end };
            }

            const diff = start - now;
            if (diff > 0 && diff < nextDiff) {
                nextDiff = diff;
                next = { l, start };
            }
        });

        if (!current) {
            els.currentLesson.textContent = 'Зараз пари немає';
            els.currentMeta.textContent = '—';
            els.currentProgress.style.width = '0%';
        } else {
            const total = current.end - current.start;
            const done = now - current.start;
            const pct = clamp(Math.round((done / total) * 100), 0, 100);
            const leftMin = Math.max(0, Math.ceil((current.end - now) / 60000));
            els.currentLesson.textContent = current.l.discipline || 'Пара';
            els.currentMeta.textContent = `${current.l.displayTime} · ${current.l.room || '—'} · залишилось ${leftMin} хв`;
            els.currentProgress.style.width = `${pct}%`;
        }

        if (!next) {
            els.nextLesson.textContent = 'Наступної пари не знайдено';
            els.nextMeta.textContent = '—';
            els.nextCountdown.textContent = '—';
            return;
        }

        const mins = Math.floor(nextDiff / 60000);
        const hours = Math.floor(mins / 60);
        const remain = mins % 60;
        const text = hours > 0 ? `${hours}г ${remain}хв` : `${remain} хв`;
        els.nextLesson.textContent = next.l.discipline || 'Пара';
        els.nextMeta.textContent = `${next.l.date} · ${next.l.displayTime} · ${next.l.room || '—'}`;
        els.nextCountdown.textContent = `Через ${text}`;
    }

    function renderScore(lessons) {
        const metrics = computeComfortScore(lessons);
        els.comfortScore.textContent = String(metrics.score);
        els.comfortMeta.textContent = `Вікна: ${metrics.windows} · Пізні: ${metrics.latePairs} · Переходи: ${metrics.moves}`;
        state.simBaseScore = metrics.score;
    }

    function stableMapForToday(lessons) {
        const out = new Map();
        const today = toDmyFromIso(new Date().toISOString().slice(0, 10));
        lessons.filter((l) => l.date === today).forEach((l) => {
            const stable = [l.date, l.discipline, l.teacher, l.group, l.type].join('||');
            out.set(stable, { pair: l.pair, room: l.room, label: `${l.displayTime} · ${l.discipline}` });
        });
        return out;
    }

    function pushBoardEvent(type, text) {
        state.liveBoardEvents.unshift({
            at: new Date().toLocaleTimeString('uk-UA'),
            type,
            text
        });
        state.liveBoardEvents = state.liveBoardEvents.slice(0, 80);
        renderBoard();
    }

    function diffLiveBoard(prevMap, nextMap) {
        nextMap.forEach((nextVal, key) => {
            if (!prevMap.has(key)) {
                pushBoardEvent('added', `Додано: ${nextVal.label} (${nextVal.room || '—'})`);
                return;
            }
            const prevVal = prevMap.get(key);
            if (prevVal.pair !== nextVal.pair) {
                pushBoardEvent('moved', `Перенесено пару: ${prevVal.pair} → ${nextVal.pair} (${nextVal.label})`);
            } else if ((prevVal.room || '') !== (nextVal.room || '')) {
                pushBoardEvent('room', `Зміна аудиторії: ${prevVal.room || '—'} → ${nextVal.room || '—'} (${nextVal.label})`);
            }
        });

        prevMap.forEach((prevVal, key) => {
            if (!nextMap.has(key)) {
                pushBoardEvent('removed', `Прибрано: ${prevVal.label} (${prevVal.room || '—'})`);
            }
        });
    }

    function renderBoard() {
        els.liveBoard.innerHTML = '';
        if (!state.liveBoardEvents.length) {
            els.liveBoard.innerHTML = '<div class="text-sm text-gray-500">Змін за сьогодні поки немає</div>';
            return;
        }
        state.liveBoardEvents.forEach((e) => {
            const div = document.createElement('div');
            div.className = 'board-card rounded-xl border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700';
            div.innerHTML = `<div class="text-xs text-gray-500">${e.at} · ${e.type}</div><div class="text-sm font-semibold">${e.text}</div>`;
            els.liveBoard.appendChild(div);
        });
    }

    function getItemLabel(item, fallback) {
        if (!item || typeof item !== 'object') return fallback || '';
        return String(item.Value ?? item.value ?? item.Name ?? item.name ?? item.Title ?? item.title ?? fallback ?? '');
    }

    function getItemKey(item, fallback) {
        if (!item || typeof item !== 'object') return fallback || '';
        return String(item.Key ?? item.key ?? item.ID ?? item.Id ?? item.id ?? fallback ?? '');
    }

    function fillSelect(selectEl, values, labelKey, valueKey, options) {
        const opts = options || {};
        const autoSelectFirst = !!opts.autoSelectFirst;
        const current = selectEl.value;

        while (selectEl.options.length > 1) selectEl.remove(1);

        values.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = valueKey ? String(item[valueKey] ?? '') : getItemKey(item, '');
            opt.textContent = labelKey ? String(item[labelKey] ?? '') : getItemLabel(item, opt.value);
            selectEl.appendChild(opt);
        });

        const hasCurrent = values.some((item) => {
            const k = valueKey ? String(item[valueKey] ?? '') : getItemKey(item, '');
            return k === current;
        });

        if (current && hasCurrent) {
            selectEl.value = current;
        } else if (autoSelectFirst && selectEl.options.length > 1) {
            selectEl.selectedIndex = 1;
        } else {
            selectEl.selectedIndex = 0;
        }
    }

    function setModeUI() {
        const isGroup = state.mode === 'group';
        els.eduFormSelect.classList.toggle('hidden', !isGroup);
        els.courseSelect.classList.toggle('hidden', !isGroup);
        els.chairSelect.classList.toggle('hidden', isGroup);
        const label = isGroup ? 'Оберіть групу...' : 'Оберіть викладача...';
        els.entitySelect.innerHTML = `<option value="">${label}</option>`;
        state.entities = [];
        state.selectedEntity = null;
    }

    async function loadBaseFilters() {
        try {
            setStatus('Завантаження фільтрів...');
            const data = await SA.fetchApi('GetStudentScheduleFiltersData', {}, { useCache: false });
            if (!data) {
                setStatus('Не вдалося завантажити фільтри', true);
                return;
            }
            state.faculties = data.faculties || [];
            state.eduForms = data.educForms || [];
            state.courses = data.courses || [];
            fillSelect(els.facultySelect, state.faculties, 'Value', 'Key', { autoSelectFirst: true });
            fillSelect(els.eduFormSelect, state.eduForms, 'Value', 'Key', { autoSelectFirst: true });
            fillSelect(els.courseSelect, state.courses, 'Value', 'Key', { autoSelectFirst: true });
            setStatus('Оберіть параметри і натисніть Завантажити Smart Day');
        } catch (e) {
            setStatus(`Помилка завантаження фільтрів: ${e.message}`, true);
        }
    }

    async function loadGroups() {
        if (!els.facultySelect.value) {
            state.entities = [];
            fillSelect(els.entitySelect, [], null, null);
            return;
        }

        try {
            setStatus('Завантаження груп...');
            const data = await SA.fetchApi('GetStudyGroups', {
                aFacultyID: els.facultySelect.value,
                aEducationForm: els.eduFormSelect.value || '0',
                aCourse: els.courseSelect.value || '0'
            }, { useCache: false });

            state.entities = (data && data.studyGroups) ? data.studyGroups : [];
            fillSelect(els.entitySelect, state.entities, 'Value', 'Key', { autoSelectFirst: state.entities.length === 1 });
            setStatus(`Знайдено груп: ${state.entities.length}`);
        } catch (e) {
            setStatus(`Помилка завантаження груп: ${e.message}`, true);
        }
    }

    async function loadChairsAndEmployees() {
        if (!els.facultySelect.value) {
            state.chairs = [];
            state.entities = [];
            fillSelect(els.chairSelect, [], null, null);
            fillSelect(els.entitySelect, [], null, null);
            return;
        }

        try {
            setStatus('Завантаження кафедр...');
            const c = await SA.fetchApi('GetEmployeeChairs', { aFacultyID: els.facultySelect.value }, { useCache: false });
            state.chairs = (c && c.chairs) ? c.chairs : [];
            fillSelect(els.chairSelect, state.chairs, 'Value', 'Key', { autoSelectFirst: true });
            setStatus(`Знайдено кафедр: ${state.chairs.length}`);
            if (els.chairSelect.value) {
                await loadEmployees();
            } else {
                state.entities = [];
                fillSelect(els.entitySelect, [], null, null);
            }
        } catch (e) {
            setStatus(`Помилка завантаження кафедр: ${e.message}`, true);
        }
    }

    async function loadEmployees() {
        if (!els.facultySelect.value || !els.chairSelect.value) {
            state.entities = [];
            fillSelect(els.entitySelect, [], null, null);
            return;
        }

        try {
            setStatus('Завантаження викладачів...');
            const data = await SA.fetchApi('GetEmployees', {
                aFacultyID: els.facultySelect.value,
                aChairID: els.chairSelect.value
            }, { useCache: false });

            state.entities = Array.isArray(data) ? data : [];
            fillSelect(els.entitySelect, state.entities, 'Value', 'Key', { autoSelectFirst: state.entities.length === 1 });
            setStatus(`Знайдено викладачів: ${state.entities.length}`);
        } catch (e) {
            setStatus(`Помилка завантаження викладачів: ${e.message}`, true);
        }
    }

    async function fetchScheduleAndRender(isRefresh) {
        if (!state.currentAction || !state.currentPayload) return;
        const data = await SA.fetchApi(state.currentAction, state.currentPayload, { silent: true, useCache: false });
        if (!Array.isArray(data)) return;

        state.lessons = data;
        state.normalized = data.map(normalizeLesson);
        renderHeatmap(state.normalized);
        renderScore(state.normalized);
        renderSimLessonOptions(state.normalized);
        updateSmartDayWidgets();

        const newMap = stableMapForToday(state.normalized);
        if (isRefresh) diffLiveBoard(state.prevStableMap, newMap);
        state.prevStableMap = newMap;
    }

    async function loadSmartDay() {
        const entityId = els.entitySelect.value;
        if (!entityId) {
            setStatus('Оберіть групу або викладача', true);
            return;
        }

        const entityName = els.entitySelect.selectedOptions[0] ? els.entitySelect.selectedOptions[0].textContent : entityId;
        state.selectedEntity = {
            id: entityId,
            name: entityName,
            type: state.mode === 'group' ? 'Група' : 'Викладач'
        };

        const start = toDmyFromIso(els.dateStart.value);
        const end = toDmyFromIso(els.dateEnd.value);
        if (!start || !end) {
            setStatus('Оберіть коректний діапазон дат', true);
            return;
        }

        const payload = {
            aStartDate: start,
            aEndDate: end,
            aStudyTypeID: ''
        };

        if (state.mode === 'group') payload.aStudyGroupID = entityId;
        else payload.aEmployeeID = entityId;

        state.currentAction = state.mode === 'group' ? 'GetScheduleDataX' : 'GetScheduleDataEmp';
        state.currentPayload = payload;
        state.liveBoardEvents = [];
        state.prevStableMap = new Map();
        renderBoard();

        setStatus('Завантаження розкладу...');
        await fetchScheduleAndRender(false);
        setStatus(`Smart Day готовий: ${state.normalized.length} занять`);
    }

    async function runWhatIf() {
        const idx = parseInt(els.simLessonSelect.value, 10);
        if (Number.isNaN(idx)) {
            els.simResult.textContent = 'Оберіть пару для симуляції';
            return;
        }

        const action = els.simAction.value;
        const room = String(els.simRoom.value || '').trim();
        const copy = state.normalized.map((l) => ({ ...l }));
        const target = copy[idx];
        if (!target) return;

        if (action === 'shift+1') target.pair = clamp(target.pair + 1, 1, 7);
        if (action === 'shift-1') target.pair = clamp(target.pair - 1, 1, 7);

        const t = PAIR_TIMES[target.pair];
        if (t) {
            target.start = t.start;
            target.end = t.end;
            target.displayTime = `${target.pair} пара (${t.start}-${t.end})`;
        }

        if (room) target.room = room;

        const sim = computeComfortScore(copy);
        const delta = sim.score - state.simBaseScore;
        const sign = delta >= 0 ? '+' : '';
        els.simResult.textContent = `Було: ${state.simBaseScore} → Стало: ${sim.score} (${sign}${delta}). Вікна: ${sim.windows}, пізні: ${sim.latePairs}, переходи: ${sim.moves}`;
    }

    async function pollLiveBoard() {
        if (!state.currentAction || !state.currentPayload) return;
        await fetchScheduleAndRender(true);
    }

    function toggleBoardMode() {
        state.boardMode = !state.boardMode;
        if (state.boardMode) {
            els.root.classList.add('max-w-none');
            els.root.classList.add('px-2');
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
            return;
        }

        els.root.classList.remove('max-w-none');
        els.root.classList.remove('px-2');
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    function setupDates() {
        const now = new Date();
        const next = new Date(now);
        next.setDate(now.getDate() + 7);
        els.dateStart.value = now.toISOString().slice(0, 10);
        els.dateEnd.value = next.toISOString().slice(0, 10);
    }

    function bind() {
        els.modeSelect.addEventListener('change', async () => {
            state.mode = els.modeSelect.value;
            setModeUI();
            if (state.mode === 'teacher') await loadChairsAndEmployees();
            else await loadGroups();
        });

        els.facultySelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
            else await loadChairsAndEmployees();
        });

        els.eduFormSelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
        });

        els.courseSelect.addEventListener('change', async () => {
            if (state.mode === 'group') await loadGroups();
        });

        els.chairSelect.addEventListener('change', loadEmployees);
        els.loadBtn.addEventListener('click', loadSmartDay);
        els.runSimBtn.addEventListener('click', runWhatIf);
        els.toggleBoardBtn.addEventListener('click', toggleBoardMode);
    }

    async function init() {
        setupDates();
        bind();
        setModeUI();
        await loadBaseFilters();

        if (state.mode === 'group') await loadGroups();
        else await loadChairsAndEmployees();

        if (state.pollingTimer) clearInterval(state.pollingTimer);
        state.pollingTimer = setInterval(pollLiveBoard, 30000);

        if (state.clockTimer) clearInterval(state.clockTimer);
        state.clockTimer = setInterval(updateSmartDayWidgets, 1000);
    }

    init().catch((e) => setStatus(`Помилка ініціалізації: ${e.message}`, true));
})(window.ScheduleApp);
