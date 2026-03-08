const fs = require('fs');
const { compile } = require('vue/compiler-dom');

const html = fs.readFileSync('vercel_index.html', 'utf8');
const match = html.match(/<div id="app"[\s\S]*?<\/div>\s*<!-- End of #app -->/);

let appHtml = match ? match[0] : html;

try {
    const render = compile(appHtml);
    console.log("SUCCESS");
} catch (e) {
    console.log("ERROR");
    console.error(e.message);
}
