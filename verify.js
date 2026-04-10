const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const parseTags = (content, tag) => {
    let open = (content.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
    let close = (content.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
    return { open, close, diff: open - close };
}

let result = '';
result += 'DIV: ' + JSON.stringify(parseTags(html, 'div')) + '\n';
result += 'SPAN: ' + JSON.stringify(parseTags(html, 'span')) + '\n';
result += 'BUTTON: ' + JSON.stringify(parseTags(html, 'button')) + '\n';
result += 'HEADER: ' + JSON.stringify(parseTags(html, 'header')) + '\n';
result += 'FOOTER: ' + JSON.stringify(parseTags(html, 'footer')) + '\n';
result += 'MAIN: ' + JSON.stringify(parseTags(html, 'main')) + '\n';

fs.writeFileSync('output.txt', result);
