const { test, expect } = require('@playwright/test');
const domain = require('../../js/session-domain');
const { planPublication, revision } = require('../../api/session-publication');
const form = 'денна форма навчання';
const exam = domain.normalizeItem({ term: 'Зима 2026', studyForm: form, groups: ['12а'], discipline: 'Математика', controlType: 'іспит', teacher: 'Іваненко І.І.', date: '2026-12-10', time: '10:00', room: '101' });
async function openEditor(page, invalid = false) {
  let session = { term: 'Зима 2026', generatedAt: 'old', sourceFile: '', items: [exam] };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/api/session') return route.fulfill({ json: { faculties: [], courses: [], educForms: [] } });
    if (request.method() === 'GET') return route.fulfill({ json: { sessions: [session], items: session.items, revision: revision(session) } });
    const payload = request.postDataJSON();
    try {
      const plan = planPublication({ sessions: [session] }, payload);
      if (payload.action === 'previewPublication') return route.fulfill({ json: { revision: plan.currentRevision, validation: plan.validation, changes: plan.changes, summary: plan.summary } });
      session = { ...session, items: plan.items, generatedAt: 'new' };
      return route.fulfill({ json: { ...plan.summary, revision: revision(session) } });
    } catch (error) { return route.fulfill({ status: error.statusCode || 500, json: { error: error.message } }); }
  });
  await page.addInitScript(({ form, invalid }) => {
    const rows = [{ id: 'exam', group: '12а', discipline: 'Математика', teachers: ['Іваненко І.І.'], controlType: 'іспит', date: '2026-12-10', time: '12:00', room: '101' }];
    if (invalid) rows.push({ id: 'bad', group: '13а', discipline: 'Фізика', teachers: ['Петренко П.П.'], controlType: 'іспит', date: '', time: '', room: '' });
    localStorage.setItem('session_constructor_draft_v1', JSON.stringify({ fields: { sessionTerm: 'Зима 2026', studyForm: form }, rows }));
  }, { form, invalid });
  await page.goto('/session-constructor.html');
  await expect(page.locator('#tableBody tr')).toHaveCount(invalid ? 2 : 1);
  await page.locator('#adminPassword').fill('test-password');
}
test('methodist previews a corrected exam and publishes exactly one replacement', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openEditor(page);
  await expect(page.locator('#uploadBtn')).toBeDisabled();
  await page.locator('#previewPublicationBtn').click();
  await expect(page.locator('#publicationSummary')).toContainText('змінено 1');
  await expect(page.locator('#publicationChanges')).toContainText('10:00');
  await expect(page.locator('#publicationChanges')).toContainText('12:00');
  await page.screenshot({ path: test.info().outputPath('constructor-preview.png'), fullPage: true });
  await page.locator('#publicationAcknowledged').check();
  await page.locator('#uploadBtn').click();
  await expect(page.locator('#publicationSummary')).toContainText('Опубліковано');
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});
test('editing a reviewed draft disables publication until another preview', async ({ page }) => {
  await openEditor(page);
  await page.locator('#previewPublicationBtn').click();
  await expect(page.locator('#publicationSummary')).toContainText('Серверна перевірка пройдена');
  await page.locator('#publicationAcknowledged').check();
  await expect(page.locator('#uploadBtn')).toBeEnabled();
  await page.locator('#tableBody input[data-f="time"]').fill('14:00');
  await expect(page.locator('#uploadBtn')).toBeDisabled();
  await expect(page.locator('#publicationAcknowledged')).not.toBeChecked();
});
test('hidden rows are still checked and block publication', async ({ page }) => {
  await openEditor(page, true);
  await page.locator('#searchInput').fill('Математика');
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await expect(page.locator('#reviewIssues')).toContainText('Фізика');
  await page.locator('#previewPublicationBtn').click();
  await expect(page.locator('#publicationSummary')).toContainText('Публікацію заблоковано');
  await page.locator('#publicationAcknowledged').check();
  await expect(page.locator('#uploadBtn')).toBeDisabled();
});
test('problem links open hidden records and the missing-fields filter keeps them', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openEditor(page, true);
  await page.locator('#searchInput').fill('Математика');
  await page.locator('#reviewIssues button').filter({ hasText: 'Вкажіть дату' }).click();
  await expect(page.locator('#tableBody tr')).toHaveCount(2);
  await page.locator('#filterMissingBtn').click();
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await expect(page.locator('#tableBody')).toContainText('Видалити');
  await expect(page.locator('#tableBody input[data-f="discipline"]')).toHaveValue('Фізика');
  expect(errors).toEqual([]);
});
