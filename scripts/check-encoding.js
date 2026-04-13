const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const exts = new Set(['.js', '.html', '.css', '.md', '.json', '.yml', '.yaml']);
const ignoreDirs = new Set(['node_modules', '.git']);
const ignoreFiles = new Set([
    path.resolve(__filename),
    path.join(ROOT, 'schedule.min.js'),
    path.join(ROOT, 'schedule-loader.js'),
    path.join(ROOT, 'page.html')
]);

const badPatterns = [
    /вЂ[^"]?/g,               // cp1251 mojibake marker (e.g. вЂ”, вЂ™)
    /Р[Ѓѓ]/g,                 // broken UTF-8 pairs
    /С[Ѓѓ]/g,
    /[ЃѓЉЊЋЏђљњќћџ]/g,       // suspicious chars rarely valid in UA text
    /�/g                      // replacement char
];

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoreDirs.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else if (exts.has(path.extname(ent.name).toLowerCase())) out.push(full);
    }
    return out;
}

function scanFile(file) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('\u0000')) return [];

    const lines = content.split(/\r?\n/);
    const hits = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const markers = [];
        for (const pattern of badPatterns) {
            const m = line.match(pattern);
            if (m && m.length) markers.push(...m);
        }

        if (markers.length) {
            hits.push({
                line: i + 1,
                sample: Array.from(new Set(markers)).slice(0, 5),
                text: line.slice(0, 160)
            });
        }

        if (hits.length >= 10) break;
    }

    return hits;
}

const files = walk(ROOT);
const issues = [];

for (const file of files) {
    const resolved = path.resolve(file);
    if (ignoreFiles.has(resolved)) continue;
    const hits = scanFile(file);
    if (hits.length) issues.push({ file, hits });
}

if (issues.length) {
    console.error('Encoding check failed. Suspicious mojibake markers found:');
    for (const item of issues.slice(0, 200)) {
        console.error(`- ${path.relative(ROOT, item.file)}`);
        for (const hit of item.hits.slice(0, 3)) {
            console.error(`  L${hit.line}: [${hit.sample.join(', ')}] ${hit.text}`);
        }
    }
    process.exit(1);
}

console.log(`Encoding check passed (${files.length} files).`);
