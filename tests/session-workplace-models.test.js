const domain = require('../js/session-domain');
const calendar = require('../js/session-calendar');
const importer = require('../js/session-import-preview');
const row = overrides => ({ discipline: 'Math', group: '12а', teachers: ['Teacher'], controlType: 'іспит', date: '2027-01-10', time: '10:00', room: '101', ...overrides });
test('unconfigured policies add no institution-specific restrictions', () => {
  expect(domain.normalizeRules({})).toMatchObject({ configured: false, examDurationMinutes: 0, minExamGapDays: 0, enforcePlanningRules: false });
  expect(domain.validate([row()]).blockingCount).toBe(0);
});
test('institution constraints can warn or block and configured duration detects overlap', () => {
  const rows = [row(), row({ discipline: 'Physics', date: '2027-01-11' })];
  expect(domain.validate(rows, { minExamGapDays: 3 }).issues).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'examGap', severity: 'warning' })]));
  expect(domain.validate(rows, { minExamGapDays: 3, enforcePlanningRules: true }).blockingCount).toBeGreaterThan(0);
  expect(domain.validate([row(), row({ group: '13а', discipline: 'Physics', time: '11:00' })], { examDurationMinutes: 120 }).conflictsCount).toBe(2);
  expect(() => domain.normalizeRules({ workdayStart: '18:00', workdayEnd: '08:00' })).toThrow();
});
test('calendar aligns weeks, keeps undated entries and does not mutate rows', () => {
  const rows = [row(), row({ group: '13а', date: '' })];
  const before = JSON.stringify(rows); const result = calendar.project(rows, '2027-01', '12а');
  expect(result.days).toHaveLength(42); expect(new Date(result.days[0].date + 'T12:00:00').getDay()).toBe(1);
  expect(result.days.find(day => day.date === '2027-01-10').rows).toHaveLength(1);
  expect(calendar.project(rows, '2027-01').unscheduled).toHaveLength(1); expect(JSON.stringify(rows)).toBe(before);
});
test('import mapping detects shuffled headings, reports unknown rows and exact duplicates', () => {
  const rows = [['Група', 'Дата', 'Предмет', 'Викладач', 'Час', 'Аудиторія', 'Тип контролю'], ['12а', '10.01.2027', 'Math', 'Teacher', '10:00', '101', 'іспит'], ['12а', '10.01.2027', 'Math', 'Teacher', '10:00', '101', 'іспит'], ['', '', '', 'broken', '', '', '']];
  expect(importer.detect(rows).mapping.discipline).toBe(2);
  const preview = importer.build([{ rows }]);
  expect(preview.duplicates).toBe(1); expect(preview.unrecognised).toBe(1);
  expect(preview.entries[0].row.date).toBe('2027-01-10'); expect(preview.entries[2].include).toBe(false);
});
test('large conflicting imports keep all blocking rows while bounding diagnostic details', () => {
  const rows = Array.from({ length: 10000 }, (_, index) => row({ discipline: 'Subject ' + index }));
  const result = domain.validate(rows);
  expect(result.blockingIndices).toHaveLength(10000);
  expect(result.issues.length).toBeLessThanOrEqual(500);
  expect(result.truncatedIssues).toBeGreaterThan(0);
});
test('a joint event counts as one exam in teacher workload rules', () => {
  expect(domain.validate([row({ eventId: 'joint' }), row({ eventId: 'joint', group: '13а' })], { maxTeacherExamsPerDay: 1, enforcePlanningRules: true }).blockingCount).toBe(0);
});
