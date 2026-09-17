describe('semester lesson numbering', () => {
    const ref = value => ({ value });
    let SA, storage;
    beforeEach(() => {
        jest.resetModules();
        storage = {};
        global.localStorage = { getItem: key => storage[key] || null, setItem: (key, value) => { storage[key] = value; } };
        global.window = { ScheduleApp: {
            stripHtml: value => String(value),
            toLocalIsoDate: date => date.toISOString().slice(0, 10),
            ScheduleModel: {
                dmyToIso: date => date.split('.').reverse().join('-'),
                getLessonStatusFlags: row => ({ cancelled: !!row.cancelled })
            },
            buildSchedulePayload: (_, refs) => ({ action: 'history', payload: { start: refs.dateStart.value, end: refs.dateEnd.value } })
        }, prompt: jest.fn(), alert: jest.fn() };
        require('../js/lesson-numbering');
        SA = window.ScheduleApp;
    });
    afterEach(() => { delete global.window; delete global.localStorage; });
    const row = (date, type = 'Лекції', group = '42У') => ({ full_date: date, discipline: 'Алгебра', study_type: type, contingent: group, study_time: '1 пара' });
    async function setup(rows, fetchRows = rows) {
        let run;
        SA.fetchApi = jest.fn(async () => fetchRows);
        const entity = { id: 'g1', type: 'Група', scheduleData: rows };
        const refs = { dateStart: ref('2026-09-14'), dateEnd: ref('2026-09-20'), activeEntities: ref([entity]) };
        const model = SA.createLessonNumbering({ ref, watch: (_, cb, opts) => { if (opts) run = cb; } }, refs);
        await run();
        return { model, refs, entity, run };
    }
    test('uses history, separates types and groups, deduplicates and excludes cancelled meetings', async () => {
        const current = row('14.09.2026');
        const history = [row('01.09.2026'), row('01.09.2026'), { ...row('07.09.2026'), cancelled: true }, row('08.09.2026', 'Лабораторні'), row('09.09.2026', 'Лекції', '43У'), current];
        const { model, entity } = await setup([current], history);
        expect(model.numberFor({ numberKey: model.key(entity, current) })).toBe(2);
        expect(model.numberFor({ numberKey: model.key(entity, history[3]) })).toBe(1);
        expect(SA.fetchApi.mock.calls[0][1].start).toBe('2026-09-01');
    });
    test('does not invent numbers when history fails; manual numbers persist and can be reset', async () => {
        const current = row('14.09.2026');
        const { model, entity } = await setup([current], null);
        const lesson = { numberKey: model.key(entity, current) };
        expect(model.numberFor(lesson)).toBeNull();
        window.prompt.mockReturnValue('7');
        model.editNumber(lesson);
        expect(model.numberFor(lesson)).toBe(7);
        expect(storage.schedule_number_overrides).toContain('7');
        window.prompt.mockReturnValue('');
        model.editNumber(lesson);
        expect(model.numberFor(lesson)).toBeNull();
    });
});
