const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 4018;
let proc = null;

const PAGES = [
    { page: '/index.html', jsFile: 'js/app.js' },
    { page: '/index2.html', jsFile: null },
    { page: '/staff.html', jsFile: null },
    { page: '/builder.html', jsFile: 'js/builder.js' },
    { page: '/session.html', jsFile: 'js/session-page.js' },
    { page: '/session-admin.html', jsFile: 'js/session-admin.js' },
    { page: '/session-constructor.html', jsFile: 'js/session-constructor.js' },
    { page: '/session-prep.html', jsFile: null },
    { page: '/course-live.html', jsFile: 'js/course-live.js' },
    { page: '/smart.html', jsFile: null }
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
            if (!entry.jsFile) continue;
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
            if (!entry.jsFile) continue;
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

    test('schedule filters keep one responsive sidebar and explicit dependency states', () => {
        const desktop = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

        expect((desktop.match(/class="[^"]*desktop-sidebar/g) || [])).toHaveLength(1);
        expect(desktop).not.toContain('sidebar-content-mobile');
        expect(desktop).toContain('advanced-schedule-filters');
        expect(desktop).toContain(':disabled="!selectedFaculty || !selectedEduForm"');
        expect(desktop).toContain('mobile-menu-btn');
        expect(desktop).toContain('md:hidden');
    });

    test('legacy mobile entry redirects to the unified responsive interface', () => {
        const desktop = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
        const legacyMobile = fs.readFileSync(path.resolve(__dirname, '..', 'index2.html'), 'utf8');

        expect(desktop).not.toContain("schedule_ui_variant");
        expect(desktop).not.toContain('/index2.html?mobile=1');
        expect(legacyMobile).toContain("window.location.replace('/index.html'");
        expect(legacyMobile).not.toContain('id="app"');
    });

    test('empty schedule explains when mobile filters hide loaded lessons', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
        const js = fs.readFileSync(path.resolve(__dirname, '..', 'js/app.js'), 'utf8');

        expect(html).toContain('Розклад приховано фільтрами');
        expect(html).toContain('@click="clearScheduleFilters"');
        expect(html).toContain(':aria-pressed="deliveryModeFilter === \'online\'"');
        expect(js).toContain('const scheduleHiddenByFilters = computed');
        expect(js).toContain('const clearScheduleFilters = () =>');
    });

    test('student week mode hides analytics and can jump to the current day', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
        const js = fs.readFileSync(path.resolve(__dirname, '..', 'js/app.js'), 'utf8');
        const shell = fs.readFileSync(path.resolve(__dirname, '..', 'js/app-shell.js'), 'utf8');

        expect(html).toContain('id="schedule-week"');
        expect(html).toContain('@click="scrollToTodaySchedule(true)"');
        expect(html).toContain("activeEntities.length > 0 && (mode !== 'student' || !studentWeekFocus)");
        expect(html).toContain(':data-schedule-date="dayData.date"');
        expect(js).toContain("localStorage.getItem('schedule_student_week_focus') !== 'false'");
        expect(js).toContain("prefers-reduced-motion: reduce");
        expect(shell).toContain("['Мій тиждень', '/index.html#schedule-week']");
    });
});
