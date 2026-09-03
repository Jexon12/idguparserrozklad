import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const failures = [];
let checked = 0;

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.name.toLowerCase().endsWith('.html')) check(full);
  }
}

function check(file) {
  const source = fs.readFileSync(file, 'utf8');
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    checked += 1;
    try {
      new Function(match[1]);
    } catch (error) {
      failures.push({ file, script: index + 1, error: String(error) });
    }
  });
}

walk(root);
console.log(JSON.stringify({ checked, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
