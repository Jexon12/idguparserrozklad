const reliability = require('../js/reliability');

describe('client reliability contracts', () => {
    test('rejects reversed and excessive schedule date ranges', () => {
        expect(reliability.validateDateRange('2026-09-10', '2026-09-01').valid).toBe(false);
        expect(reliability.validateDateRange('2026-09-01', '2026-12-01').valid).toBe(false);
        expect(reliability.validateDateRange('2026-09-01', '2026-09-14')).toMatchObject({ valid: true, days: 14 });
    });

    test('removes malformed schedule records', () => {
        const result = reliability.sanitizeSchedule([
            { full_date: '03.09.2026', discipline: 'Математика' },
            null,
            { full_date: 123, discipline: 'Фізика' }
        ]);
        expect(result.rows).toHaveLength(1);
        expect(result.rejected).toBe(2);
    });

    test('keeps a bounded client error journal', () => {
        const values = new Map();
        const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
        for (let index = 0; index < 110; index++) reliability.recordClientError(new Error(`failure ${index}`), 'test', storage);
        expect(reliability.readErrorLog(storage)).toHaveLength(100);
        expect(reliability.readErrorLog(storage)[0].message).toBe('failure 109');
    });
});
