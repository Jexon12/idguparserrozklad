const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const exts = new Set(['.js', '.html', '.css', '.md', '.json']);
const ignore = new Set(['node_modules', '.git']);
const ignoreFiles = new Set([path.resolve(__filename)]);
const badPatterns = [
    /Р[Ђ-џ]/g, // common mojibake pairs like Рџ, РІ, Р°
    /С[Ђ-џ]/g, // common mojibake pairs like СЊ, С‚
    /Ð[-¿]/g, // UTF-8 bytes interpreted as latin
    /Ñ[-¿]/g,
    /вЂ[^\s]/g // broken punctuation sequences
];

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignore.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else if (exts.has(path.extname(ent.name))) out.push(full);
    }
    return out;
}

const files = walk(ROOT);
const issues = [];

for (const file of files) {
    if (ignoreFiles.has(path.resolve(file))) continue;
    const txt = fs.readFileSync(file, 'utf8');
    const found = badPatterns
        .map((re) => (txt.match(re) || [])[0])
        .filter(Boolean);
    if (found.length) issues.push({ file, found: Array.from(new Set(found)) });
}

if (issues.length) {
    console.error('Encoding check failed. Suspicious mojibake found:');
    issues.slice(0, 200).forEach((x) => console.error(`- ${path.relative(ROOT, x.file)} [${x.found.join(', ')}]`));
    process.exit(1);
}

console.log(`Encoding check passed (${files.length} files).`);
