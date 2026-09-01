const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('consolidated page architecture', () => {
    test('session constructor exposes the four-step workflow', () => {
        const html = read('session-constructor.html');
        expect(html).toContain('id="step-source"');
        expect(html).toContain('id="step-edit"');
        expect(html).toContain('id="proPanel"');
        expect(html).toContain('id="step-publish"');
        expect(html).not.toContain('id="purgeApiBtn"');
    });

    test('legacy session prep points to constructor', () => {
        const html = read('session-prep.html');
        expect(html).toContain('/session-constructor.html?source=schedule');
        expect(fs.existsSync(path.join(root, 'legacy/pages/session-prep.html'))).toBe(true);
    });

    test('Smart Day is present in the main interfaces', () => {
        expect(read('index.html')).toContain('id="smart-day"');
        expect(read('index.html')).toContain('smartSimulationResult');
        expect(read('index2.html')).toContain('id="smart-day"');
        expect(read('smart.html')).toContain('/index.html?desktop=1#smart-day');
    });

    test('public and staff navigation are separated', () => {
        const shell = read('js/app-shell.js');
        expect(shell).toContain('publicRoles');
        expect(shell).toContain('student');
        expect(shell).toContain('teacher');
        expect(shell).toContain('staffPaths');
        expect(shell).toContain('DataFreshness');
        expect(read('index.html')).toContain('js/app-shell.js');
        expect(read('index.html')).not.toContain('href="/builder.html"');
        expect(read('index.html')).not.toContain('href="/course-live.html"');
        expect(read('index.html')).not.toContain('href="/session-admin.html"');
        expect(read('index2.html')).not.toContain('href="/session-constructor.html"');
        expect(read('session.html')).not.toContain('href="/session-admin.html"');
        expect(read('staff.html')).toContain('data-audience="staff"');
        expect(read('staff.html')).toContain('href="/builder.html"');
        expect(read('staff.html')).toContain('href="/session-admin.html"');
        expect(read('index.html')).toContain('v-if="staffToolsEnabled"');
        expect(read('staff.html')).toContain('staff=1');
    });

    test('student and teacher filters have one clear meaning', () => {
        const desktop = read('index.html');
        expect(desktop).not.toContain('v-model="selectedStudyType"');
        expect(desktop).toContain("mode === 'teacher' ? 'Швидкий пошук викладача'");
        expect(desktop).toContain('v-if="staffToolsEnabled" @click="mode = \'occupancy\'"');
        expect(read('index2.html')).toContain("mode === 'teacher' ? 'Пошук викладача...'");
        expect(read('staff.html')).toContain('tool=occupancy');
    });

    test('legacy and print artifacts no longer pollute the root', () => {
        ['page.html', 'schedule-loader.js', 'schedule.min.js', 'diagnostic.js', 'USER_GUIDE_PDF.html']
            .forEach((file) => expect(fs.existsSync(path.join(root, file))).toBe(false));
        expect(fs.existsSync(path.join(root, 'legacy/external-widget/page.html'))).toBe(true);
        expect(fs.existsSync(path.join(root, 'docs/print/USER_GUIDE_PDF.html'))).toBe(true);
    });
});
