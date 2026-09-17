/* Ordinals count scheduled meetings, not syllabus topics or completed work. */
(function (SA) {
    const clean = value => SA.stripHtml(String(value || '')).trim().toLocaleLowerCase('uk-UA');
    const series = row => JSON.stringify([
        clean(row.discipline), clean(row.study_type || row.type),
        clean(row.contingent || row.study_group || row.groupName || row.group)
    ]);
    const occurrence = row => JSON.stringify([
        series(row), row.full_date, String(row.study_time || '').match(/\d+/)?.[0] || row.study_time_begin
    ]);
    SA.LessonNumbering = { series, occurrence };
    SA.createLessonNumbering = ({ ref, watch }, refs) => {
        const defaultStart = () => {
            const [year, month] = refs.dateStart.value.split('-').map(Number);
            return month >= 9 ? `${year}-09-01` : month >= 2 ? `${year}-02-01` : `${year - 1}-09-01`;
        };
        const semesterStart = ref(localStorage.getItem('schedule_numbering_start') || defaultStart());
        const numbers = ref({});
        const status = ref('');
        const historyRows = ref({});
        const historyState = ref('idle');
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('schedule_number_overrides') || '{}'); } catch (_) { /* optional preference */ }
        const overrides = ref(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {});
        const key = (entity, row) => JSON.stringify([semesterStart.value, entity.type, entity.id, occurrence(row)]);
        let generation = 0;
        watch(semesterStart, value => localStorage.setItem('schedule_numbering_start', value));
        watch(() => [semesterStart.value, refs.dateEnd.value, JSON.stringify(refs.activeEntities.value)], async () => {
            const request = ++generation;
            numbers.value = {};
            historyRows.value = {};
            historyState.value = 'idle';
            if (!refs.activeEntities.value.length) { status.value = ''; return; }
            const start = semesterStart.value;
            const end = refs.dateEnd.value;
            const span = (new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000;
            if (!start || !end || !Number.isFinite(span) || span < 0 || span > 366) {
                status.value = 'Укажіть початок семестру до кінця вибраного періоду (не більше року).';
                historyState.value = 'error';
                return;
            }
            status.value = 'Завантажуємо історію для нумерації…';
            historyState.value = 'loading';
            const result = {};
            const allHistory = {};
            try {
                for (const entity of refs.activeEntities.value) {
                    let history = [];
                    if (String(entity.id).startsWith('demo-')) history = entity.scheduleData || [];
                    else {
                        let cursor = start;
                        while (cursor <= end) {
                            if (request !== generation) return;
                            const last = new Date(`${cursor}T12:00:00`);
                            last.setDate(last.getDate() + 27);
                            const chunkEnd = SA.toLocalIsoDate(last) < end ? SA.toLocalIsoDate(last) : end;
                            const { action, payload } = SA.buildSchedulePayload(entity, {
                                dateStart: { value: cursor }, dateEnd: { value: chunkEnd }, selectedStudyType: { value: '' }
                            });
                            const rows = await SA.fetchApi(action, payload, { silent: true });
                            if (!Array.isArray(rows)) throw new Error('History unavailable');
                            history.push(...rows);
                            last.setTime(new Date(`${chunkEnd}T12:00:00`).getTime());
                            last.setDate(last.getDate() + 1);
                            cursor = SA.toLocalIsoDate(last);
                        }
                    }
                    // Current visible data takes precedence over cached history.
                    const unique = new Map(history.concat(entity.scheduleData || []).map(row => [occurrence(row), row]));
                    const rows = [...unique.values()].filter(row => {
                        const date = SA.ScheduleModel.dmyToIso(row.full_date);
                        return date >= start && date <= end && !SA.ScheduleModel.getLessonStatusFlags(row).cancelled;
                    }).sort((a, b) => SA.ScheduleModel.dmyToIso(a.full_date).localeCompare(SA.ScheduleModel.dmyToIso(b.full_date)) ||
                        (parseInt(a.study_time) || 0) - (parseInt(b.study_time) || 0));
                    const counters = new Map();
                    rows.forEach(row => {
                        const group = series(row);
                        const number = (counters.get(group) || 0) + 1;
                        counters.set(group, number);
                        result[key(entity, row)] = number;
                    });
                    allHistory[JSON.stringify([entity.type, entity.id])] = rows.map(row => ({
                        ...row, numberKey: key(entity, row), series: series(row),
                        teacher: SA.getLessonTeacher ? SA.getLessonTeacher({ ...row, entityType: entity.type, entityName: entity.name }) : (row.teacher || row.employee || '')
                    }));
                }
                if (request !== generation) return;
                numbers.value = result;
                historyRows.value = allHistory;
                historyState.value = 'ready';
                status.value = 'Номери за розкладом від початку семестру; натисніть номер для уточнення.';
            } catch (_) {
                if (request === generation) {
                    status.value = 'Історію не завантажено — автоматичні номери недоступні.';
                    historyState.value = 'error';
                }
            }
        }, { immediate: true });
        const numberFor = lesson => overrides.value[lesson.numberKey] || numbers.value[lesson.numberKey] || null;
        const historyFor = lesson => {
            if (!lesson) return [];
            const rows = historyRows.value[JSON.stringify([lesson.entityType, lesson.entityId])] || [];
            const index = rows.findIndex(row => row.numberKey === lesson.numberKey);
            if (index < 0) return [];
            return rows.slice(0, index).filter(row => row.series === rows[index].series).reverse();
        };
        const editNumber = lesson => {
            const input = window.prompt('Номер лише цього заняття. Порожнє поле — автоматичний номер.', numberFor(lesson) || '');
            if (input === null) return;
            const value = input.trim();
            if (value && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 999)) {
                window.alert('Укажіть ціле число від 1 до 999.');
                return;
            }
            const next = { ...overrides.value };
            if (value) next[lesson.numberKey] = Number(value);
            else delete next[lesson.numberKey];
            overrides.value = next;
            localStorage.setItem('schedule_number_overrides', JSON.stringify(next));
        };
        return { semesterStart, status, key, numberFor, editNumber, historyFor, historyState };
    };
})(window.ScheduleApp);
