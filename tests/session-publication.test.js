const domain = require('../js/session-domain');
const { planPublication, revision } = require('../api/session-publication');
const item = overrides => domain.normalizeItem({ term: 'Winter', studyForm: 'денна', groups: ['12а'], discipline: 'Math', controlType: 'іспит', teacher: 'Teacher A', date: '2026-12-10', time: '10:00', room: '101', ...overrides });
const store = items => ({ sessions: [{ term: 'Winter', items, generatedAt: 'old', sourceFile: '' }] });

describe('session publication and shared validation', () => {
  test('editing a time updates one record rather than appending a copy', () => {
    const plan = planPublication(store([item()]), { data: { term: 'Winter', items: [item({ time: '12:00' })] } });
    expect(plan.items).toHaveLength(1);
    expect(plan.summary).toMatchObject({ added: 0, changed: 1, removed: 0 });
    expect(plan.items[0].time).toBe('12:00');
  });
  test('replacing a form keeps the other form and reports removals', () => {
    const plan = planPublication(store([item(), item({ studyForm: 'заочна', groups: ['13а'], date: '2026-12-12' })]), {
      mode: 'replaceForm', data: { term: 'Winter', studyForm: 'денна', items: [item({ groups: ['14а'], date: '2026-12-14' })] }
    });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.some(it => it.studyForm === 'заочна')).toBe(true);
    expect(plan.summary).toMatchObject({ added: 1, removed: 1 });
  });
  test('a valid import cannot collide with an already published teacher or room', () => {
    const plan = planPublication(store([item()]), { data: { term: 'Winter', items: [item({ groups: ['13а'], discipline: 'Physics' })] } });
    expect(plan.validation.blockingCount).toBeGreaterThan(0);
    expect(plan.validation.issues.map(i => i.type)).toContain('conflict-teacher');
  });
  test('resources are checked against other sessions', () => {
    const existing = store([item()]);
    const plan = planPublication(existing, { data: { term: 'Summer', items: [item({ groups: ['13а'], discipline: 'Physics' })] } });
    expect(plan.validation.blockingCount).toBeGreaterThan(0);
  });
  test('rejects stale revisions and mixed form replacements', () => {
    expect(() => planPublication(store([item()]), { expectedRevision: revision(null), data: { term: 'Winter', items: [] } })).toThrow(/інший/);
    expect(() => planPublication(store([]), { mode: 'replaceForm', data: { term: 'Winter', studyForm: 'заочна', items: [item()] } })).toThrow(/іншу форму/);
  });
  test('detects overlapping intervals and accepts adjacent intervals', () => {
    expect(domain.validate([item({ time: '10:00-11:30' }), item({ discipline: 'Physics', time: '11:00-12:00' })]).conflictsCount).toBe(2);
    expect(domain.validate([item({ time: '10:00-11:30' }), item({ discipline: 'Physics', time: '11:30-12:30' })]).conflictsCount).toBe(0);
  });
  test('normalizes dates and rejects malformed values', () => {
    expect(item({ date: '10.12.2026', time: '9.00' })).toMatchObject({ date: '2026-12-10', time: '09:00' });
    const result = domain.validate([item({ date: '2026-02-31', time: '25:00' })]);
    expect(result.quality).toMatchObject({ invalidDate: 1, invalidTime: 1 });
  });
  test('joint events require an explicit shared identity', () => {
    expect(domain.validate([item(), item({ groups: ['13а'] })]).conflictsCount).toBe(2);
    expect(domain.validate([item({ eventId: 'joint' }), item({ groups: ['13а'], eventId: 'joint' })]).conflictsCount).toBe(0);
  });
  test('diff preserves repeated subject events and does not hide a removal', () => {
    const changes = domain.diff([item(), item({ date: '2026-12-14' })], [item()]);
    expect(changes.removed).toHaveLength(1);
    expect(changes.added).toHaveLength(0);
  });
  test('untimed credits need date, teacher and group but not exam room', () => {
    expect(domain.validate([item({ controlType: 'залік', time: '', room: '' })]).blockingCount).toBe(0);
    expect(domain.validate([item({ teacher: '', groups: [] })]).quality).toMatchObject({ missingTeacher: 1, missingGroup: 1 });
  });
});

test('publication diff reports changes to all stored fields', () => {
  const before = item({ speciality: 'Стара', program: 'Одна' });
  const plan = planPublication(store([before]), { mode: 'replaceForm', data: { term: 'Winter', studyForm: 'денна', items: [item({ speciality: 'Нова', program: 'Друга' })] } });
  expect(plan.summary.changed).toBe(1);
  expect(plan.changes.changed[0].after).toMatchObject({ speciality: 'Нова', program: 'Друга' });
});
