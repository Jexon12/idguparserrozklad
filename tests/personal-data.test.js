describe('personal data and note compatibility', () => {
    let SA, data;
    beforeEach(() => {
        jest.resetModules(); data = {};
        global.window = { ScheduleApp: { STORAGE_KEY: 'schedule_app_v1' } };
        global.localStorage = {
            getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, removeItem: key => { delete data[key]; }
        };
        require('../js/notes'); require('../js/personal-data'); SA = window.ScheduleApp;
    });
    afterEach(() => { delete global.window; delete global.localStorage; });
    test('same-slot subjects have independent notes and old notes remain readable', () => {
        const lesson = { entityId: 'g1', entityType: 'Група', discipline: 'Алгебра', type: 'Лекції', group: '42У' };
        const other = { ...lesson, discipline: 'Фізика' };
        const date = '21.09.2026', time = '1 пара';
        expect(SA.getNoteKey(lesson, date, time)).not.toBe(SA.getNoteKey(other, date, time));
        const refs = { notesMap: { value: { [`g1_${date}_${time}`]: 'old' } }, currentNoteKey: {}, currentNoteTitle: {}, noteText: {}, showNoteModal: {}, saveState: jest.fn() };
        SA.openNote(lesson, date, time, refs); expect(refs.noteText.value).toBe('old');
        refs.noteText.value = 'new'; SA.saveNote(refs);
        SA.openNote(other, date, time, refs); expect(refs.noteText.value).toBe('old');
        SA.deleteNote(SA.getNoteKey(lesson, date, time), refs);
        expect(SA.hasNote(lesson, date, time, refs)).toBe(false);
        expect(refs.notesMap.value[`g1_${date}_${time}`]).toBe('old');
    });
    test('backup includes personal data only and merges without deleting unrelated notes', () => {
        data.schedule_app_v1 = JSON.stringify({ notesMap: { a: 'A' }, activeEntities: [{ secret: true }] });
        data.adminPassword = 'not-for-export';
        const backup = SA.PersonalData.export();
        expect(JSON.stringify(backup)).not.toContain('secret');
        expect(JSON.stringify(backup)).not.toContain('not-for-export');
        backup.data.notes = { b: 'B' }; SA.PersonalData.restore(backup);
        expect(JSON.parse(data.schedule_app_v1).notesMap).toEqual({ a: 'A', b: 'B' });
    });
    test('invalid backups do not write anything', () => {
        data.schedule_app_v1 = '{"notesMap":{"a":"A"}}';
        const snapshot = { ...data };
        expect(() => SA.PersonalData.restore({ format: 'schedule-personal-data', version: 1, data: { notes: { a: {} } } })).toThrow();
        expect(data).toEqual(snapshot);
    });
});
