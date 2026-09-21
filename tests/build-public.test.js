const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPublic } = require('../scripts/build-public');

test('Vercel output includes site assets but excludes server and private files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-build-test-'));
    try {
        const files = ['index.html', 'staff.html', 'sw.js', 'js/app.js', 'css/styles.css',
            'data/demo-schedule.json', 'data/session-2025-26.json', 'data/links.json',
            'legacy/external-widget/page.html', 'docs/print/USER_GUIDE_PDF.html',
            '.env.local', 'db.json', 'api/index.js', 'server.js'];
        for (const file of files) {
            const target = path.join(root, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, file);
        }
        const output = buildPublic(root);
        expect(fs.readFileSync(path.join(output, 'index.html'), 'utf8')).toBe('index.html');
        expect(fs.existsSync(path.join(output, 'js/app.js'))).toBe(true);
        for (const privatePath of ['.env.local', 'db.json', 'api', 'server.js']) {
            expect(fs.existsSync(path.join(output, privatePath))).toBe(false);
        }
        fs.writeFileSync(path.join(output, 'obsolete.js'), 'old generated file');
        buildPublic(root);
        expect(fs.existsSync(path.join(output, 'obsolete.js'))).toBe(false);
        fs.unlinkSync(path.join(output, '.schedule-generated'));
        expect(() => buildPublic(root)).toThrow('unmanaged');
        const config = require('../vercel.json');
        expect(config.outputDirectory).toBe('public');
        expect(config.buildCommand).toBe('npm run build');
        expect(config.rewrites).toContainEqual({ source: '/api/(.*)', destination: '/api/index.js' });
    } finally {
        // Fresh, test-owned temp directory, never a user workspace.
        fs.rmSync(root, { recursive: true, force: true });
    }
});
