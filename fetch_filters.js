const http = require('http');
const fs = require('fs');

const url = "http://vnz.osvita.net/WidgetSchedule.asmx/GetStudentScheduleFiltersData?aVuzID=11927";
http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('filters_clean.json', data);
        console.log("Download complete. Content preview:");
        console.log(data.substring(0, 500));
    });
});
