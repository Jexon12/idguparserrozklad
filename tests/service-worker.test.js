const fs = require('fs');
const vm = require('vm');

function worker(cache, keys = []) {
    const handlers = {};
    const caches = { open: jest.fn(async () => cache), keys: async () => keys, delete: jest.fn(async () => true) };
    const fetch = jest.fn();
    vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), {
        self: { addEventListener: (name, fn) => { handlers[name] = fn; }, location: { origin: 'https://example.test' }, clients: { claim: jest.fn() } },
        caches, fetch, URL, Response: class { constructor(body, options) { this.status = options.status; } }
    });
    return { handlers, caches, fetch };
}

test('activation removes only previous schedule caches', async () => {
    const w = worker({}, ['schedule-obsolete', 'another-app']);
    let pending;
    w.handlers.activate({ waitUntil: promise => { pending = promise; } });
    await pending;
    expect(w.caches.delete.mock.calls).toEqual([['schedule-obsolete']]);
});

test('cache quota does not discard a successful online response', async () => {
    const w = worker({ put: async () => { throw Error('quota'); } });
    const response = { ok: true, clone() { return this; } };
    w.fetch.mockResolvedValue(response);
    let pending;
    w.handlers.fetch({ request: { url: 'https://example.test/js/app.js?v=1', method: 'GET' }, respondWith: promise => { pending = promise; } });
    expect(await pending).toBe(response);
});

test('offline navigation accepts query strings but scripts keep exact versions', async () => {
    const page = { status: 200 };
    const w = worker({ match: async key => key === '/index.html' ? page : undefined });
    w.fetch.mockRejectedValue(Error('offline'));
    let pending;
    w.handlers.fetch({ request: { url: 'https://example.test/index.html?demo=1', method: 'GET', mode: 'navigate' }, respondWith: promise => { pending = promise; } });
    expect(await pending).toBe(page);
    w.handlers.fetch({ request: { url: 'https://example.test/js/app.js?v=missing', method: 'GET' }, respondWith: promise => { pending = promise; } });
    expect((await pending).status).toBe(503);
});
