const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadUtils() {
    const source = fs.readFileSync(path.resolve(__dirname, '../js/utils.js'), 'utf8');
    const sandbox = {
        window: { location: { port: '', hostname: 'example.test' } },
        document: { createElement: () => ({}), head: { appendChild: () => {} } },
        URL,
        console
    };
    vm.runInNewContext(source, sandbox);
    return sandbox.window.ScheduleApp;
}

describe('utility regressions', () => {
    test('escapeHtml neutralizes markup and attribute delimiters', () => {
        const SA = loadUtils();
        expect(SA.escapeHtml(`<img src=x onerror="alert(1)">'`))
            .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;');
    });

    test('local ISO formatter keeps the local calendar day', () => {
        const SA = loadUtils();
        const localDate = new Date(2026, 7, 31, 0, 30, 0);
        expect(SA.toLocalIsoDate(localDate)).toBe('2026-08-31');
    });
});

describe('API client regressions', () => {
    test('HTTP errors are returned as null and are not cached', async () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../js/api.js'), 'utf8');
        let calls = 0;
        const sandbox = {
            window: {
                location: { origin: 'https://example.test' },
                ScheduleApp: { API_PROXY: '/api/', VUZ_ID: 1 }
            },
            fetch: async () => {
                calls += 1;
                return { ok: false, status: 503, text: async () => JSON.stringify({ error: 'offline' }) };
            },
            AbortController,
            URL,
            setTimeout,
            clearTimeout,
            console
        };
        vm.runInNewContext(source, sandbox);
        const first = await sandbox.window.ScheduleApp.fetchApi('GetEmployees', {}, { silent: true, retryDelayMs: 0 });
        const second = await sandbox.window.ScheduleApp.fetchApi('GetEmployees', {}, { silent: true, retryDelayMs: 0 });
        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(calls).toBe(6);
    });

    test('temporary API failure is retried and recovered', async () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../js/api.js'), 'utf8');
        let calls = 0;
        const sandbox = {
            window: { location: { origin: 'https://example.test' }, ScheduleApp: { API_PROXY: '/api/', VUZ_ID: 1 } },
            fetch: async () => {
                calls += 1;
                if (calls < 2) return { ok: false, status: 503, text: async () => 'temporary' };
                return { ok: true, status: 200, text: async () => JSON.stringify({ d: [{ Key: 1, Value: 'A' }] }) };
            },
            AbortController, URL, setTimeout, clearTimeout, console
        };
        vm.runInNewContext(source, sandbox);
        const result = await sandbox.window.ScheduleApp.fetchApi('GetEmployees', {}, { silent: true, retryDelayMs: 0 });
        expect(result).toHaveLength(1);
        expect(calls).toBe(2);
    });
});
