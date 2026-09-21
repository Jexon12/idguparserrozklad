'use strict';
// Mechanical build output: local Vue runtime and content-derived asset versions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const digest = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
const vendor = path.join(root, 'js/vendor');
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(require.resolve('vue/dist/vue.global.prod.js'), path.join(vendor, 'vue.global.prod.js'));
const assets = new Map();
const analyticsFile = path.join(path.dirname(require.resolve('@vercel/analytics/package.json')), 'dist/index.mjs');
const analytics = fs.readFileSync(analyticsFile);
fs.writeFileSync(path.join(vendor, 'vercel-analytics.mjs'), analytics);
const analyticsUrl = `/js/vendor/vercel-analytics.mjs?v=${digest(analytics)}`;
assets.set('js/vendor/vercel-analytics.mjs', analyticsUrl);
const analyticsEntry = path.join(root, 'js/web-analytics.js');
const analyticsSource = fs.readFileSync(analyticsEntry, 'utf8');
fs.writeFileSync(analyticsEntry, analyticsSource.replace(/from '[^']*vendor\/vercel-analytics\.mjs(?:\?[^']*)?'/,
    `from '${analyticsUrl}'`));
for (const filename of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const target = path.join(root, filename);
    let html = fs.readFileSync(target, 'utf8');
    html = html.replace(/https:\/\/unpkg\.com\/vue@[^/]+\/dist\/vue\.global\.prod\.js/g, 'js/vendor/vue.global.prod.js');
    html = html.replace(/\b(src|href)="(\/?(?:js|css)\/[^"?]+)(?:\?[^"\s]*)?"/g, (match, attr, asset) => {
        const relative = asset.replace(/^\//, '');
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) return match;
        const url = `/${relative}?v=${digest(fs.readFileSync(file))}`;
        assets.set(relative, url);
        return `${attr}="${url}"`;
    });
    if (html !== fs.readFileSync(target, 'utf8')) fs.writeFileSync(target, html);
}
const manifest = [...assets.values()].sort();
const swPath = path.join(root, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html')).sort()
    .map(name => name + fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
const swSource = sw.replace(/const CACHE_NAME = '[^']+';/, '')
    .replace(/const VERSIONED_ASSETS = \[[\s\S]*?\];/, '');
const version = digest(manifest.join('\n') + pages + swSource);
sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'schedule-${version}';`);
const declaration = `const VERSIONED_ASSETS = ${JSON.stringify(manifest, null, 2)};`;
sw = sw.includes('const VERSIONED_ASSETS = ')
    ? sw.replace(/const VERSIONED_ASSETS = \[[\s\S]*?\];/, declaration)
    : sw.replace('// Network-first', `${declaration}\n\n// Network-first`);
fs.writeFileSync(swPath, sw);
console.log(`Built ${manifest.length} versioned assets; release ${version}`);
