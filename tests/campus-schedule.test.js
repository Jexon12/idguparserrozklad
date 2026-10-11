const { aggregateDays, findConflicts, rangeDays, kind, shortTeacher } = require('../js/campus-schedule');
const lesson = (overrides = {}) => ({ discipline: 'Робототехніка', teacher: 'Кожухар Жанна Вікторівна', cabinet: '512/к1', type: 'Лекція', group: '36У', ...overrides });
const day = (rows, start = '08:30', end = '09:50') => ({ date: '15.10.2026', dayName: 'Четвер', slots: [{ time: '1 пара', start, end, lessons: rows }] });
test('a shared lecture combines groups, retains original records, and creates no conflict', () => {
    const rows = [lesson(), lesson({ group: '38У' }), lesson({ group: '36У', entityId: 'second-source' })];
    const result = aggregateDays([day(rows)]);
    expect(result[0].slots[0].lessons).toHaveLength(1);
    expect(result[0].slots[0].lessons[0].groups).toEqual(['36У', '38У']);
    expect(result[0].slots[0].lessons[0].sourceLessons).toEqual(rows);
    expect(rows[0].groups).toBeUndefined();
    expect(findConflicts(result).size).toBe(0);
});
test('different types, numbers or missing room do not merge', () => {
    const rows = [lesson({ number: 1 }), lesson({ number: 2 }), lesson({ type: 'Практична', number: 1 }), lesson({ cabinet: '', number: 1 })];
    expect(aggregateDays([day(rows)], l => l.number)[0].slots[0].lessons).toHaveLength(4);
});
test('two teachers in different rooms at the same time are not a conflict', () => {
    expect(findConflicts(aggregateDays([day([lesson(), lesson({ teacher: 'Більдін Дмитро', cabinet: '303/к1' })])])).size).toBe(0);
});
test('same room or same teacher on distinct overlapping lessons is a conflict', () => {
    const result = aggregateDays([day([lesson(), lesson({ discipline: 'Програмування' })])]);
    const issues = findConflicts(result);
    expect(issues.size).toBe(2);
    expect([...issues.values()][0]).toEqual(['Викладач має два заняття одночасно', 'Збіг аудиторії 512/к1']);
});
test('overlap is checked across different pairs; adjacent and cancelled lessons are excluded', () => {
    const source = day([lesson()]);
    source.slots.push({ time:'2 пара', start:'09:40', end:'11:00', lessons:[lesson({ discipline:'Інший предмет' })] });
    expect(findConflicts(aggregateDays([source])).size).toBe(2);
    source.slots[1].start='09:50';
    expect(findConflicts(aggregateDays([source])).size).toBe(0);
    source.slots[1].start='09:40';source.slots[1].lessons[0].isCancelled=true;
    expect(findConflicts(aggregateDays([source])).size).toBe(0);
});
test('unassigned rooms do not conflict, calendar includes empty weekdays, and compact labels are Ukrainian', () => {
    expect(findConflicts(aggregateDays([day([lesson({ cabinet:'' }), lesson({ teacher:'Більдін Дмитро', cabinet:'' })])])).size).toBe(0);
    expect(rangeDays('2026-10-12','2026-10-16',[day([lesson()])]).map(d => d.date)).toEqual(['12.10.2026','13.10.2026','14.10.2026','15.10.2026','16.10.2026']);
    expect(kind('Лабораторні')).toBe('lab');
    expect(shortTeacher('Кожухар Жанна Вікторівна')).toBe('Кожухар Ж.');
});
test('a shared online platform name is not a shared physical room', () => {
    const rows=[lesson({cabinet:'Google Meet'}),lesson({teacher:'Більдін Дмитро',cabinet:'Google Meet'})];
    expect(findConflicts(aggregateDays([day(rows)])).size).toBe(0);
});
