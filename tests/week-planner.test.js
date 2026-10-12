const { simulate, teacherKey } = require('../js/week-planner');
const times = { 1: { start: '08:00', end: '09:20' }, 2: { start: '09:30', end: '10:50' }, 3: { start: '11:00', end: '12:20' } };
const row = overrides => ({ date: '10.12.2026', pair: 3, group: '12а', teacher: 'Teacher A', room: '101', discipline: 'Math', ...overrides });
test('simulated moves respect shared teachers and rooms', () => {
  const plan = simulate([row(), row({ pair: 4, group: '13а', teacher: 'Teacher B' })], { [teacherKey('Teacher A')]: new Set(), [teacherKey('Teacher B')]: new Set() }, times);
  expect(plan.rows.map(r => r.pair)).toEqual([1, 2]);
});
test('external teacher occupancy blocks a target slot', () => {
  const plan = simulate([row()], { [teacherKey('Teacher A')]: new Set(['10.12.2026||1', '10.12.2026||2']) }, times);
  expect(plan.rows[0].pair).toBe(3);
});
test('unverified and shared lessons stay in their original slots', () => {
  expect(simulate([row()], {}, times)).toMatchObject({ unverified: 1, rows: [{ pair: 3 }] });
  const shared = simulate([row(), row({ group: '13а' })], { [teacherKey('Teacher A')]: new Set() }, times);
  expect(shared.rows.map(r => r.pair)).toEqual([3, 3]);
});
