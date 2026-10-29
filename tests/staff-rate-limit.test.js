const { checkStaffRate } = require('../api/staff-rate-limit');
test.each(['redis', 'kv'])('staff limits share atomic counters in %s', async type => {
  const counters = new Map();
  const client = { eval: jest.fn(async (script, options, args) => {
    const key = type === 'redis' ? options.keys[0] : options[0];
    const window = Number(type === 'redis' ? options.arguments[0] : args[0]);
    const count = (counters.get(key) || 0) + 1; counters.set(key, count);
    expect(script).toContain("redis.call('PEXPIRE'");
    return [count, window];
  }) };
  const cfg = { max: 2, windowMs: 15000 };
  expect((await checkStaffRate({type, client}, 'login', 'person', cfg)).allowed).toBe(true);
  expect((await checkStaffRate({type, client}, 'login', 'person', cfg)).allowed).toBe(true);
  expect((await checkStaffRate({type, client}, 'login', 'person', cfg)).allowed).toBe(false);
  expect((await checkStaffRate({type, client}, 'login', 'another', cfg)).allowed).toBe(true);
  expect([...counters.keys()][0]).not.toContain('person');
});
