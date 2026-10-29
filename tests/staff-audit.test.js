const { createStaffService } = require('../api/staff-service');

test('a saved staff change reports an audit failure without claiming the change failed', async () => {
  let state = {};
  const service = createStaffService({
    read: async () => structuredClone(state), storage: async () => 'test',
    mutate: async fn => { const copy = structuredClone(state); const result = await fn(copy); state = copy; return result; },
    audit: async () => false
  }, () => 'setup-password');
  async function call(url, body, cookie = '') {
    const result = { headers: {} };
    await service.handle({ url, method: 'POST', body, headers: { cookie } }, {
      setHeader: (key, value) => { result.headers[key] = value; },
      status: code => ({ json: json => { result.status = code; result.json = json; } })
    });
    return result;
  }
  const setup = await call('/api/staff/auth/bootstrap', { setupPassword: 'setup-password', username: 'admin', name: 'Admin', password: 'personal-password' });
  const response = await call('/api/staff/users', { username: 'colleague', name: 'Колега', role: 'methodist', password: 'personal-password' }, setup.headers['Set-Cookie'].split(';')[0]);
  expect(response.status).toBe(200);
  expect(response.json.warning).toMatch(/журнал/);
  expect(state.users.some(user => user.username === 'colleague')).toBe(true);
});
