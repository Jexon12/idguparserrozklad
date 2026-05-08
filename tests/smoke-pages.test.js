const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 4017;
let proc = null;

function request(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: pathname,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function waitServerReady(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const r = await request('/api/health');
            if (r.status === 200) return;
        } catch (e) { /* retry */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('Server did not become ready in time');
}

async function stopServerProcess(child, timeoutMs = 2000) {
    if (!child || child.killed) return;
    await new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        child.once('exit', finish);
        try { child.kill(); } catch (_) { finish(); }
        setTimeout(() => {
            if (!done) {
                try { child.kill('SIGKILL'); } catch (_) {}
                finish();
            }
        }, timeoutMs).unref?.();
    });
}

describe('Smoke pages/API', () => {
    beforeAll(async () => {
        proc = spawn(process.execPath, ['server.js'], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env, PORT: String(PORT) },
            stdio: 'ignore'
        });
        await waitServerReady();
    }, 25000);

    afterAll(async () => {
        await stopServerProcess(proc);
    });

    test('health endpoint', async () => {
        const r = await request('/api/health');
        expect(r.status).toBe(200);
    });

    test('main pages return 200', async () => {
        const pages = [
            '/',
            '/index2.html',
            '/builder.html',
            '/session.html',
            '/session-admin.html',
            '/session-constructor.html',
            '/session-prep.html',
            '/course-live.html',
            '/smart.html'
        ];
        for (const p of pages) {
            const r = await request(p);
            expect(r.status).toBe(200);
        }
    });
});
