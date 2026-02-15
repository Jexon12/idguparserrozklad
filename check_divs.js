const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/<div[\s>]/g) || []).length;
    const closes = (line.match(/<\/div>/g) || []).length;
    if (opens > 0 || closes > 0) {
        depth += opens;
        depth -= closes;
        if (depth <= 2) console.log(`${(i + 1).toString().padStart(4)}: depth=${depth} o=${opens} c=${closes} | ${line.trim().substring(0, 90)}`);
    }
}
console.log('Final depth:', depth);
