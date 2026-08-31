const model = require('../js/schedule-model');
const importer = require('../js/session-import');
const analytics = require('../js/schedule-analytics');

describe('shared schedule model contracts', () => {
    test('converts valid DMY dates without UTC shifts', () => {
        expect(model.dmyToIso('31.08.2026')).toBe('2026-08-31');
        expect(model.dmyToIso('31.02.2026')).toBe('');
        expect(model.isoToDmy('2026-08-31')).toBe('31.08.2026');
    });

    test('normalizes different API lesson shapes to one contract', () => {
        const lesson = model.normalizeLesson({
            full_date: '31.08.2026',
            study_time: '2 пара',
            discipline: '1. Алгоритми;',
            employee: ' Іваненко  І. І. ',
            contingent: '12а',
            cabinet: 'Корпус 2, 301',
            study_type: 'Лекція'
        }, { times: { 2: { start: '10:00', end: '11:20' } } });
        expect(lesson).toMatchObject({
            date: '2026-08-31', pair: 2, discipline: 'Алгоритми',
            group: '12а', start: '10:00', end: '11:20', building: '2'
        });
    });

    test('splits and deduplicates teacher names', () => {
        expect(model.splitTeachers('Іваненко І.І., Петренко П.П. / Іваненко І.І.'))
            .toEqual(['Іваненко І.І.', 'Петренко П.П.']);
    });
});

describe('shared session import contracts', () => {
    test('maps a table row into a normalized session row', () => {
        const row = importer.fromCells(['1', 'Математика', '12а, 13б', 'Іваненко І.І.; Петренко П.П.', 'Екзамен', '31.08.2026', '10:00', '301']);
        expect(row).toMatchObject({
            discipline: 'Математика', groups: ['12а', '13б'],
            controlType: 'іспит', date: '31.08.2026', time: '10:00', room: '301'
        });
        expect(row.teachers).toHaveLength(2);
    });

    test('deduplicates identical imported rows', () => {
        const row = importer.fromCells(['1', 'Математика', '12а', 'Іваненко', 'залік', '', '', '']);
        expect(importer.dedupeRows([row, { ...row }])).toHaveLength(1);
    });
});

describe('shared schedule analytics contracts', () => {
    const rows = [
        { date: '31.08.2026', pair: 1, group: '12а', employee: 'Іваненко', cabinet: '301', discipline: 'A' },
        { date: '31.08.2026', pair: 3, group: '12а', employee: 'Петренко', cabinet: '301', discipline: 'B' },
        { date: '31.08.2026', pair: 3, group: '13а', employee: 'Петренко', cabinet: '301', discipline: 'C' }
    ];

    test('finds group windows and resource conflicts', () => {
        expect(analytics.windows(rows)).toEqual([expect.objectContaining({ entity: '12а', missing: [2] })]);
        const found = analytics.conflicts(rows);
        expect(found.some((item) => item.type === 'teacher' && item.pair === 3)).toBe(true);
        expect(found.some((item) => item.type === 'room' && item.pair === 3)).toBe(true);
    });

    test('calculates stable additions and removals', () => {
        const result = analytics.diff(rows.slice(0, 1), rows.slice(1, 2));
        expect(result.added).toHaveLength(1);
        expect(result.removed).toHaveLength(1);
    });

    test('scores comfort and penalizes a window', () => {
        const score = analytics.comfortScore(rows.slice(0, 2));
        expect(score.windows).toBe(1);
        expect(score.score).toBeLessThan(100);
    });
});
