const fs = require('fs');
const path = require('path');
const model = require('../js/schedule-model');
const reliability = require('../js/reliability');

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/demo-schedule.json'), 'utf8'));
const materialized = fixture.lessons.map((lesson, index) => ({
    ...lesson,
    full_date: `0${Math.min(index + 1, 9)}.09.2026`
}));

describe('persona end-to-end data scenarios', () => {
    test('student receives visible, online, moved and cancelled lessons', () => {
        const checked = reliability.sanitizeSchedule(materialized);
        expect(checked.rows).toHaveLength(5);
        const flags = checked.rows.map(model.getLessonStatusFlags);
        expect(flags.some((item) => item.online)).toBe(true);
        expect(flags.some((item) => item.moved)).toBe(true);
        expect(flags.some((item) => item.cancelled)).toBe(true);
    });

    test('teacher can derive every assigned group and a free window', () => {
        const teacherRows = materialized.filter((lesson) => lesson.employee === 'Іваненко Олена Ігорівна');
        const groups = new Set(teacherRows.map((lesson) => lesson.contingent));
        const pairs = teacherRows.filter((lesson) => lesson.dayOffset === 1).map(model.parsePairNumber).sort();
        expect(Array.from(groups).sort()).toEqual(['КН-31', 'КН-32']);
        expect(pairs).toEqual([1, 3]);
    });

    test('staff portal exposes operational diagnostics and shared navigation', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../staff.html'), 'utf8');
        expect(html).toContain('Стан системи');
        expect(html).toContain('Експорт діагностики');
        expect(html).toContain('/session-constructor.html');
        expect(html).toContain('/session-admin.html');
    });
});
