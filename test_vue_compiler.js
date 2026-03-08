const fs = require('fs');

let appHtml = '';
try {
    const html = fs.readFileSync('vercel_index.html', 'utf8');
    const startIndex = html.indexOf('<div id="app"');
    const endIndex = html.indexOf('<!-- End of #app -->');
    appHtml = html.substring(startIndex, endIndex);
    fs.writeFileSync('VUE_REGEX_SUCCESS.txt', 'Extracted length: ' + appHtml.length);
} catch (e) {
    fs.writeFileSync('VUE_REGEX_ERR.txt', e.message);
}

try {
    const { compile } = require('vue/compiler-dom');
    const render = compile(appHtml);
    fs.writeFileSync('VUE_COMPILE_SUCCESS.txt', 'OK');
} catch (e) {
    fs.writeFileSync('VUE_COMPILE_ERR.txt', e.toString());
}
