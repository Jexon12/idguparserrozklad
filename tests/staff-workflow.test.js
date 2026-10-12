const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');
const root = path.resolve(__dirname, '..');
const PORT = 4537;
let directory, dbFile, processHandle;
function request(url, body, cookie, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: url, method: body ? 'POST' : 'GET', headers: { ...extraHeaders, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, response => {
      let raw = ''; response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, json: JSON.parse(raw), cookie: response.headers['set-cookie']?.[0]?.split(';')[0], headers: response.headers }));
    }); req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}
async function start() {
  processHandle = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', ADMIN_PASSWORD: 'test-setup-password', SCHEDULE_DB_FILE: dbFile, REDIS_URL: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '' }, stdio: 'ignore' });
  for (let i = 0; i < 70; i++) { try { if ((await request('/api/health')).status === 200) return; } catch (_) {} await new Promise(resolve => setTimeout(resolve, 100)); }
  throw Error('Test server did not start');
}
async function stop() {
  if (!processHandle) return;
  const child = processHandle; processHandle = null;
  await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}
beforeAll(async () => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-staff-')); dbFile = path.join(directory, 'db.json'); await start(); }, 15000);
afterAll(async () => { await stop(); for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); });
test('bootstrap rejects weak personal passwords and foreign origins without creating accounts', async () => {
  expect((await request('/api/staff/auth/bootstrap', { setupPassword: 'test-setup-password', username: 'admin', name: 'Admin', password: 'short' })).status).toBe(400);
  expect((await request('/api/staff/auth/bootstrap', { setupPassword: 'test-setup-password', username: 'admin', name: 'Admin', password: 'personal-admin-password' }, null, { Origin: 'https://foreign.test' })).status).toBe(403);
  expect((await request('/api/staff/auth/me')).json.setupRequired).toBe(true);
});
test('personal accounts, shared drafts, restart, publication and restore use real disk persistence', async () => {
  const setup = await request('/api/staff/auth/bootstrap', { setupPassword: 'test-setup-password', username: 'admin-test', name: 'Адміністратор тесту', password: 'admin-personal-password' });
  expect(setup.status).toBe(200); const adminCookie = setup.cookie;
  expect(setup.headers['set-cookie'][0]).toContain('HttpOnly'); expect(setup.headers['set-cookie'][0]).toContain('SameSite=Strict');
  const create = (username, name, role) => request('/api/staff/users', { username, name, role, password: 'personal-user-password' }, adminCookie);
  const author = await create('methodist-test', 'Методист тесту', 'methodist');
  const publisher = await create('publisher-test', 'Відповідальний тесту', 'publisher');
  const outsider = await create('outsider-test', 'Інший методист', 'methodist');
  expect(author.status).toBe(200); expect(publisher.status).toBe(200);
  const login = async username => (await request('/api/staff/auth/login', { username, password: 'personal-user-password' })).cookie;
  const authorCookie = await login('methodist-test'), publisherCookie = await login('publisher-test'), outsiderCookie = await login('outsider-test');
  expect((await request('/api/session', { password: 'test-setup-password', action: 'previewPublication', data: { term: 'Test', items: [] } })).status).toBe(403);
  const payload = { fields: { sessionTerm: 'Тестова сесія 2027', studyForm: 'денна форма навчання' }, rows: [{ id: 'one', discipline: 'Математика', group: '12а', teachers: ['Іваненко І.І.'], controlType: 'іспит', date: '2027-01-15', time: '10:00-12:00', room: '101' }] };
  const saved = await request('/api/staff/drafts', { title: 'Підготовка', payload, sharedWith: [publisher.json.user.id] }, authorCookie);
  expect(saved.status).toBe(200); const draftId = saved.json.draft.id;
  expect((await request('/api/staff/drafts/' + draftId, null, outsiderCookie)).status).toBe(404);
  expect((await request('/api/staff/drafts/' + draftId, null, publisherCookie)).json.canEdit).toBe(true);
  const edits = await Promise.all([request('/api/staff/drafts/' + draftId, { payload, expectedVersion: 1 }, authorCookie), request('/api/staff/drafts/' + draftId, { payload, expectedVersion: 1 }, publisherCookie)]);
  expect(edits.map(result => result.status).sort()).toEqual([200, 409]);
  await stop(); await start();
  const persisted = await request('/api/staff/drafts/' + draftId, null, authorCookie);
  expect(persisted.status).toBe(200); expect(persisted.json.draft.version).toBe(2);
  const ready = await request('/api/staff/drafts/' + draftId, { payload, status: 'ready', expectedVersion: 2 }, authorCookie);
  expect(ready.status).toBe(200);
  const data = { term: payload.fields.sessionTerm, studyForm: payload.fields.studyForm, items: payload.rows.map(row => ({ ...row, groups: [row.group], teacher: row.teachers.join('; '), studyForm: payload.fields.studyForm })) };
  const context = { draftId, expectedDraftVersion: 3, mode: 'replaceForm', data };
  const preview = await request('/api/session', { ...context, action: 'previewPublication' }, authorCookie);
  expect(preview.status).toBe(200);
  const publishBody = { ...context, expectedRevision: preview.json.revision, expectedRulesRevision: preview.json.rulesRevision, actor: 'Фальшиве ім’я' };
  expect((await request('/api/session', publishBody, authorCookie)).status).toBe(403);
  const published = await request('/api/session', publishBody, publisherCookie);
  expect(published.status).toBe(200); expect(published.json.draftVersion).toBe(4);
  expect((await request('/api/staff/drafts/' + draftId, null, authorCookie)).json.draft.status).toBe('published');
  expect((await request('/api/session?term=' + encodeURIComponent(data.term))).json.items).toHaveLength(1);
  const sessionBackup = await request('/api/session?admin=1', null, adminCookie);
  expect(sessionBackup.json.history.at(-1).by).toBe('Відповідальний тесту');
  const backup = await request('/api/staff/backup', null, adminCookie);
  expect(backup.json.data.sessions).toEqual([]);
  const next = await request('/api/staff/drafts/' + draftId, { payload: { ...payload, rows: [] }, expectedVersion: 4 }, authorCookie);
  expect(next.status).toBe(200);
  const state = await request('/api/staff/rules');
  const compressedBackup = zlib.gzipSync(JSON.stringify(backup.json)).toString('base64');
  const restorePreview = await request('/api/staff/backup', { compressedBackup, preview: true, expectedVersion: state.json.stateVersion }, adminCookie);
  expect(restorePreview.status).toBe(200);
  const restored = await request('/api/staff/backup', { compressedBackup, expectedVersion: restorePreview.json.version }, adminCookie);
  expect(restored.status).toBe(200);
  expect((await request('/api/staff/drafts/' + draftId, null, authorCookie)).status).toBe(401);
  const authorRelogin = await login('methodist-test');
  expect((await request('/api/staff/drafts/' + draftId, null, authorRelogin)).json.draft.payload.rows).toHaveLength(1);
  const adminRelogin = (await request('/api/staff/auth/login', { username: 'admin-test', password: 'admin-personal-password' })).cookie;
  expect((await request('/api/staff/backup/previous', null, adminRelogin)).json.data.drafts[0].payload.rows).toHaveLength(0);
  expect(fs.readFileSync(dbFile, 'utf8')).not.toContain('personal-user-password');
  expect(fs.readFileSync(dbFile, 'utf8')).not.toContain('admin-personal-password');
  const reset = await request('/api/staff/users', { ...author.json.user, disabled: true }, adminRelogin);
  expect(reset.status).toBe(200);
  expect((await request('/api/staff/drafts', null, authorRelogin)).status).toBe(401);
  expect((await request('/api/staff/users', { ...setup.json.user, disabled: true }, adminRelogin)).status).toBe(409);
  const publisherRelogin = await login('publisher-test');
  const changedPassword = await request('/api/staff/auth/password', { currentPassword: 'personal-user-password', password: 'publisher-new-personal-password' }, publisherRelogin);
  expect(changedPassword.status).toBe(200);
  expect((await request('/api/staff/drafts', null, publisherRelogin)).status).toBe(401);
  expect((await request('/api/staff/auth/login', { username: 'publisher-test', password: 'personal-user-password' })).status).toBe(401);
  expect((await request('/api/staff/auth/login', { username: 'publisher-test', password: 'publisher-new-personal-password' })).status).toBe(200);
}, 30000);
