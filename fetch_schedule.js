const http = require('http');
const fs = require('fs');

const file = fs.createWriteStream("schedule.min.clean.js");
const request = http.get("http://vnz.osvita.net/schedule.min.js?v=20251229", function (response) {
    response.pipe(file);
    file.on('finish', function () {
        file.close(() => {
            console.log("Download completed.");
            // Read and search
            const t = fs.readFileSync('schedule.min.clean.js', 'utf8');
            const idx = t.indexOf('GetStudyGroups');
            if (idx >= 0) {
                console.log("Snippet found:");
                console.log(t.substring(idx - 100, idx + 300));
            } else {
                console.log("String not found. Content preview:");
                console.log(t.substring(0, 200));
            }
        });
    });
});
