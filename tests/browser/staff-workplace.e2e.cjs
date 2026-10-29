const { test, expect } = require('@playwright/test');
const { createStaffService } = require('../../api/staff-service');
const domain = require('../../js/session-domain');
async function fixture(page, role = 'admin') {
  let state = {}, previous = null, tail = Promise.resolve();
  const service = createStaffService({ read: async () => JSON.parse(JSON.stringify(state)), storage: async () => 'test-store',
    mutate: fn => { const run = tail.then(async () => { const copy = JSON.parse(JSON.stringify(state)); const result = await fn(copy); state = copy; return result; }); tail = run.catch(() => {}); return run; },
    audit: async () => {}, archive: async value => { previous = value; }, previousArchive: async () => previous }, () => 'test-setup-password');
  async function call(url, body, cookie) {
    const result = { headers: {} };
    await service.handle({ url, method: body ? 'POST' : 'GET', body, headers: { cookie: cookie || '' } }, { setHeader: (key, value) => { result.headers[key] = value; }, status: code => { result.status = code; return { json: json => { result.json = json; } }; } });
    return result;
  }
  const admin = await call('/api/staff/auth/bootstrap', { setupPassword: 'test-setup-password', username: 'administrator', name: 'Адміністратор', password: 'personal-admin-password' });
  let cookie = admin.headers['Set-Cookie'].split(';')[0];
  const publisher = await call('/api/staff/users', { username: 'publisher', name: 'Відповідальний', role: 'publisher', password: 'personal-publisher-password' }, cookie);
  if (role !== 'admin') {
    await call('/api/staff/users', { username: 'methodist', name: 'Методист', role: 'methodist', password: 'personal-methodist-password' }, cookie);
    const login = await call('/api/staff/auth/login', { username: 'methodist', password: 'personal-methodist-password' }); cookie = login.headers['Set-Cookie'].split(';')[0];
  }
  await page.context().addCookies([{ name: 'schedule_staff', value: cookie.split('=')[1], domain: '127.0.0.1', path: '/api', httpOnly: true, sameSite: 'Strict' }]);
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/staff/')) {
      const response = { headers: {} };
      const req = { url: url.pathname + url.search, method: request.method(), body: request.method() === 'POST' ? request.postDataJSON() : undefined, headers: request.headers() };
      await service.handle(req, { setHeader: (key, value) => { response.headers[key] = value; }, status: code => { response.status = code; return { json: value => { response.json = value; } }; } });
      return route.fulfill({ status: response.status, json: response.json, headers: response.headers });
    }
    if (url.pathname === '/api/session') return route.fulfill({ json: { sessions: [], items: [] } });
    return route.fulfill({ json: { faculties: [], courses: [], educForms: [] } });
  });
  await page.addInitScript(() => {
    localStorage.setItem('session_constructor_draft_v1', JSON.stringify({ fields: { sessionTerm: 'Зима 2027', studyForm: 'денна форма навчання' }, rows: [{ id: 'one', discipline: 'Математика', group: '12а', teachers: ['Іваненко І.І.'], controlType: 'іспит', date: '2027-01-10', time: '10:00-12:00', room: '101' }] }));
  });
  return { publisherId: publisher.json.user.id, state: () => state };
}
test('administrator configures initial rules and creates personal accounts', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  await page.goto('/staff-settings.html');
  await expect(page.locator('#staffAccount')).toContainText('Адміністратор');
  await expect(page.locator('#rulesForm button')).toBeEnabled();
  await page.locator('[name="examDurationMinutes"]').fill('120');
  await page.locator('[name="minExamGapDays"]').fill('3');
  await page.locator('#rulesForm button').click();
  await expect(page.locator('#settingsStatus')).toContainText('Правила збережено');
  await page.locator('#accountForm [name="username"]').fill('colleague');
  await page.locator('#accountForm [name="name"]').fill('Колега');
  await page.locator('#accountForm [name="password"]').fill('colleague-personal-password');
  await page.locator('#accountForm button[type="submit"]').click();
  await expect(page.locator('#accountsList')).toContainText('Колега');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('staff-settings.png'), fullPage: true });
});
test('methodist saves a shared server draft, submits it and signs out without exposing local rows', async ({ page }) => {
  const { publisherId, state } = await fixture(page, 'methodist');
  await page.goto('/session-constructor.html');
  await expect(page.locator('#cloudWorkspace')).toBeVisible();
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await page.locator('#draftSharedWith').selectOption(publisherId);
  await page.locator('#saveCloudDraft').click();
  await expect(page.locator('#cloudDraftStatus')).toContainText('версія 1');
  await page.locator('#submitCloudDraft').click();
  await expect(page.locator('#cloudDraftStatus')).toContainText('передано на перевірку');
  expect(state().drafts[0].sharedWith).toContain(publisherId);
  expect(state().drafts[0].status).toBe('ready');
  await expect(page.locator('#uploadBtn')).toBeDisabled();
  await page.locator('#staffSignOut').click();
  await expect(page.locator('#cloudWorkspace')).toBeHidden();
  await expect(page.locator('#tableBody input[data-f="discipline"]')).toHaveCount(0);
});
test('calendar edits date, interval and room in the same draft without losing changes', async ({ page }) => {
  await fixture(page, 'methodist');
  await page.goto('/session-constructor.html');
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await page.locator('#calendarPrimaryBtn').click();
  await expect(page.locator('#calendarPanel')).toContainText('Математика');
  await page.locator('[data-calendar-date="one"]').fill('2027-01-12');
  await page.locator('[data-calendar-field="time"]').fill('13:00-15:00');
  await page.locator('[data-calendar-field="room"]').fill('202');
  await page.locator('#tablePrimaryBtn').click();
  await expect(page.locator('#tableBody input[data-f="date"]')).toHaveValue('2027-01-12');
  await expect(page.locator('#tableBody input[data-f="time"]')).toHaveValue('13:00-15:00');
  await expect(page.locator('#tableBody input[data-f="room"]')).toHaveValue('202');
});
test('import preview recognises columns and requires confirmation before modifying a draft', async ({ page }) => {
  await fixture(page, 'methodist');
  await page.goto('/session-constructor.html');
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await page.evaluate(() => window.ScheduleApp.SessionImportUI.stage([{ name: 'Тестова таблиця', rows: [['Група', 'Предмет', 'Викладач', 'Тип контролю', 'Дата', 'Час', 'Аудиторія'], ['13а', 'Фізика', 'Петренко П.П.', 'іспит', '15.01.2027', '10:00-12:00', '301'], ['', '', 'Не розпізнано', '', '', '', '']] }], 'import-test.xlsx'));
  await expect(page.locator('#importSummary')).toContainText('нерозпізнаних 1');
  await expect(page.locator('#applyImport')).toBeDisabled();
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  await page.locator('#importReviewed').check();
  await page.locator('#applyImport').click();
  await expect(page.locator('#tableBody tr')).toHaveCount(2);
  await expect(page.locator('#tableBody input[data-f="discipline"]').last()).toHaveValue('Фізика');
});

test('Word export is a docx that can be imported back for editing', async ({ page }) => {
  await fixture(page, 'methodist');
  await page.route('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js', route => route.continue());
  await page.goto('/session-constructor.html');
  await expect(page.locator('#tableBody tr')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#wordBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const file = await download.path();
  const zip = await require('jszip').loadAsync(require('fs').readFileSync(file));
  expect(await zip.file('word/document.xml').async('string')).toContain('Математика');
  await page.locator('#docxFiles').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: require('fs').readFileSync(file) });
  await expect(page.locator('#importSummary')).toContainText('нерозпізнаних 0');
  await expect(page.locator('#importRows')).toContainText('Математика');
  await expect(page.locator('#importRows')).toContainText('12а');
});
