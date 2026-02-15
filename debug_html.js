const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');

let depth = 0;
let appOpen = false;
let appDepth = -1;

console.log("Analyzing index.html structure...");

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();

    // Count div opens/closes
    const opens = (line.match(/<div\b/g) || []).length;
    const closes = (line.match(/<\/div>/g) || []).length;

    // Check for #app start
    if (line.includes('id="app"')) {
        appOpen = true;
        appDepth = depth;
        console.log(`[LINE ${i + 1}] #app STARTED at depth ${depth}`);
    }

    if (opens > 0 || closes > 0) {
        const prevDepth = depth;
        depth += opens - closes;

        // If we were inside #app and now we dropped below its start depth, it closed!
        if (appOpen && depth <= appDepth) {
            console.log(`[LINE ${i + 1}] 🚨 #app CLOSED HERE! (Depth ${prevDepth} -> ${depth})`);
            console.log(`   Line content: "${trim}"`);
            appOpen = false;
        }

        // Log interesting lines around the failure area
        if (i > 870 && i < 920) {
            console.log(`[${i + 1}] d=${depth} ${trim.substring(0, 60)}`);
        }
    }
}
