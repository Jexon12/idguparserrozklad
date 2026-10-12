const fs = require('fs');
const path = require('path');
const dbPath = path.resolve(__dirname, '../db.json');
const domain = require('../js/session-domain');
let handler, memory, temp;
const savedEnv = { ...process.env };
const exam = overrides => domain.normalizeItem({ term: 'Winter', studyForm: 'денна', groups: ['12а'], discipline: 'Math', controlType: 'іспит', teacher: 'Teacher', date: '2026-12-10', time: '10:00', room: '101', ...overrides });
async function call(url, body, password) {
  const req = { url, method: body ? 'POST' : 'GET', headers: { host: 'localhost', ...(password ? { 'x-admin-password': password } : {}) }, body, socket: { remoteAddress: '127.0.0.1' } };
  const result = {};
  const res = { setHeader() {}, status(code) { result.status = code; return this; }, json(data) { result.json = data; return this; }, end() {} };
  await handler(req, res);
  return result;
}
beforeAll(() => {
  process.env.NODE_ENV = 'test'; process.env.ADMIN_PASSWORD = 'test-password';
  delete process.env.REDIS_URL; delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  handler = require('../api/index');
});
beforeEach(() => {
  handler.__resetInternalsForTests();
  memory = { session_data: { sessions: [{ term: 'Winter', generatedAt: 'old', sourceFile: '', items: [exam()] }], trash: [{ term: 'private-deleted', items: [] }], history: [{ by: 'private-actor' }], snapshots: [] } };
  temp = new Map();
  const exists = fs.existsSync.bind(fs), read = fs.readFileSync.bind(fs), write = fs.writeFileSync.bind(fs), rename = fs.renameSync.bind(fs);
  jest.spyOn(fs, 'existsSync').mockImplementation(file => String(file) === dbPath ? true : exists(file));
  jest.spyOn(fs, 'readFileSync').mockImplementation((file, options) => String(file) === dbPath ? JSON.stringify(memory) : read(file, options));
  jest.spyOn(fs, 'writeFileSync').mockImplementation((file, value, options) => String(file).startsWith(dbPath + '.') ? temp.set(String(file), JSON.parse(value)) : write(file, value, options));
  jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => String(to) === dbPath ? (memory = temp.get(String(from))) : rename(from, to));
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  for (const key of ['NODE_ENV', 'ADMIN_PASSWORD', 'REDIS_URL', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
  }
});
test('public session reads omit private metadata; administrative reads require authentication', async () => {
  const publicData = await call('/api/session?term=Winter');
  expect(publicData.status).toBe(200);
  for (const field of ['trash', 'history', 'snapshots', 'storage', 'stats']) expect(publicData.json[field]).toBeUndefined();
  expect((await call('/api/session?term=Unknown')).json.sessions).toEqual([]);
  expect((await call('/api/session?admin=1')).status).toBe(403);
  expect((await call('/api/session?admin=1', null, 'test-password')).json.trash).toHaveLength(1);
});
test('preview is read only; publication replaces the reviewed form and keeps a recoverable baseline', async () => {
  const before = JSON.stringify(memory);
  const data = { term: 'Winter', studyForm: 'денна', items: [exam({ time: '12:00' })] };
  const preview = await call('/api/session', { password: 'test-password', action: 'previewPublication', mode: 'replaceForm', data });
  expect(preview.status).toBe(200);
  expect(JSON.stringify(memory)).toBe(before);
  const saved = await call('/api/session', { password: 'test-password', mode: 'replaceForm', expectedRevision: preview.json.revision, data });
  expect(saved.status).toBe(200);
  expect(saved.json.changed).toBe(1);
  expect(memory.session_data.sessions[0].items).toHaveLength(1);
  expect(memory.session_data.sessions[0].items[0].time).toBe('12:00');
  expect(memory.session_data.snapshots[0].sessions[0].items[0].time).toBe('10:00');
  const rollback = await call('/api/session', { password: 'test-password', action: 'rollbackSnapshot', snapshotId: memory.session_data.snapshots[0].id });
  expect(rollback.status).toBe(200);
  expect(memory.session_data.sessions[0].items[0].time).toBe('10:00');
});
test('concurrent publications of one revision cannot overwrite each other', async () => {
  const preview = await call('/api/session', { password: 'test-password', action: 'previewPublication', mode: 'replaceForm', data: { term: 'Winter', studyForm: 'денна', items: [exam()] } });
  const publish = time => call('/api/session', { password: 'test-password', mode: 'replaceForm', expectedRevision: preview.json.revision, data: { term: 'Winter', studyForm: 'денна', items: [exam({ time })] } });
  const results = await Promise.all([publish('12:00'), publish('14:00')]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
});
test('server rejects missing review revision and cannot bypass validation with force', async () => {
  expect((await call('/api/session', { password: 'test-password', mode: 'replaceForm', data: { term: 'Winter', studyForm: 'денна', items: [exam()] } })).status).toBe(409);
  const before = JSON.stringify(memory);
  const current = await call('/api/session?term=Winter');
  const rejected = await call('/api/session', { password: 'test-password', expectedRevision: current.json.revision, force: true, data: { term: 'Winter', items: [exam({ discipline: 'Physics', groups: ['13а'] })] } });
  expect(rejected.status).toBe(422);
  expect(JSON.stringify(memory)).toBe(before);
});
