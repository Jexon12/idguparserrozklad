const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 4018;
let proc = null;

const PAGES = [
    { page: '/index.html', jsFile: 'js/app.js' },
    { page: '/index2.html', jsFile: 'js/app.js' },
    { page: '/builder.html', jsFile: 'js/builder.js' },
    { page: '/session.html', jsFile: 'js/session-page.js' },
    { page: '/session-admin.html', jsFile: 'js/session-admin.js' },
    { page: '/session-constructor.html', jsFile: 'js/session-constructor.js' },
    { page: '/session-prep.html', jsFile: 'js/session-prep.js' },
    { page: '/course-live.html', jsFile: 'js/course-live.js' },
    { page: '/smart.html', jsFile: 'js/smart-day.js' }
];

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
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
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
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 250));
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

function unique(arr) {
    return Array.from(new Set(arr));
}

function extractAttrValues(html, tag, attr) {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}=[\"']([^\"']+)[\"'][^>]*>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return unique(out);
}

function extractButtonIds(html) {
    const re = /<button[^>]*\sid=["']([^"']+)["'][^>]*>/gi;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return unique(out);
}

function extractVueClickHandlers(html) {
    const re = /@click(?:\.[^=\s"']+)?=["']\s*([A-Za-z_$][\w$]*)/gi;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1]);
    return unique(out);
}

function isInternalPath(value) {
    if (!value) return false;
    if (value.startsWith('//')) return false;
    if (value.startsWith('http://') || value.startsWith('https://')) return false;
    if (value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('javascript:')) return false;
    if (value.startsWith('#')) return false;
    return true;
}

function normalizeInternalPath(basePage, value) {
    const clean = value.split('#')[0];
    const noQuery = clean.split('?')[0];
    if (!noQuery) return basePage;
    if (noQuery.startsWith('/')) return noQuery;
    const baseDir = path.posix.dirname(basePage);
    return path.posix.normalize(path.posix.join(baseDir, noQuery));
}

describe('UI links/buttons regression', () => {
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

    test('all internal links/resources from key pages are resolvable', async () => {
        const broken = [];

        for (const entry of PAGES) {
            const pageRes = await request(entry.page);
            expect(pageRes.status).toBe(200);
            const html = pageRes.data;

            const hrefs = extractAttrValues(html, 'a', 'href');
            const scripts = extractAttrValues(html, 'script', 'src');
            const styles = extractAttrValues(html, 'link', 'href');
            const resources = unique([...hrefs, ...scripts, ...styles]).filter(isInternalPath);

            for (const r of resources) {
                const target = normalizeInternalPath(entry.page, r);
                const res = await request(target);
                if (res.status >= 400) broken.push(`${entry.page} -> ${r} => ${res.status}`);
            }
        }

        expect(broken).toEqual([]);
    });

    test('buttons with id are wired in corresponding page JS', () => {
        const failures = [];

        for (const entry of PAGES) {
            const htmlPath = path.resolve(__dirname, '..', entry.page.replace(/^\//, ''));
            const jsPath = path.resolve(__dirname, '..', entry.jsFile);
            const html = fs.readFileSync(htmlPath, 'utf8');
            const js = fs.readFileSync(jsPath, 'utf8');
            const buttonIds = extractButtonIds(html);

            for (const id of buttonIds) {
                const idMentioned = js.includes(`'${id}'`) || js.includes(`\"${id}\"`);
                const eventBound = js.includes(`addEventListener`) || js.includes('@click');
                if (!idMentioned || !eventBound) {
                    failures.push(`${entry.page} button#${id} not clearly wired in ${entry.jsFile}`);
                }
            }
        }

        expect(failures).toEqual([]);
    });

    test('vue click handlers from key pages exist in page scripts', () => {
        const failures = [];

        for (const entry of PAGES) {
            const htmlPath = path.resolve(__dirname, '..', entry.page.replace(/^\//, ''));
            const jsPath = path.resolve(__dirname, '..', entry.jsFile);
            const html = fs.readFileSync(htmlPath, 'utf8');
            const js = fs.readFileSync(jsPath, 'utf8');
            const handlers = extractVueClickHandlers(html);

            for (const handler of handlers) {
                const hasMethodName =
                    js.includes(`${handler}(`) ||
                    js.includes(`${handler}:`) ||
                    js.includes(`${handler} =`) ||
                    js.includes(`.${handler}`);
                if (!hasMethodName) {
                    failures.push(`${entry.page} handler "${handler}" not found in ${entry.jsFile}`);
                }
            }
        }

        expect(failures).toEqual([]);
    });
});
