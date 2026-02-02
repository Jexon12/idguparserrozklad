const http = require('http');

const url = 'http://wp-fuaid.zzz.com.ua/rozklad.html';

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const srcs = data.match(/src=["']([^"']+)["']/g);
        console.log("Script Sources found:");
        if (srcs) {
            srcs.forEach(s => console.log(s));
        } else {
            console.log("No scripts found via simple regex.");
        }
        console.log("\nFull Content Preview:");
        console.log(data.substring(0, 500));
    });
}).on('error', (e) => {
    console.error(e);
});
