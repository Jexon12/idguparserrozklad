const http = require('http');

const methods = [
    'GetAuditoriums',
    'GetCabinets',
    'GetClassrooms',
    'GetRooms',
    'GetAuditoriumList',
    'GetCabinetList',
    'GetScheduleDataAuditorium', // Maybe returns data directly
    'GetScheduleDataCabinet',
    'GetStudyGroups',
    'GetGroups'
];

const vuzId = 11927;

methods.forEach(method => {
    const options = {
        hostname: 'vnz.osvita.net',
        path: `/WidgetSchedule.asmx/${method}?aVuzID=${vuzId}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'http://wp-fuaid.zzz.com.ua/'
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            // If it's a 500, it probably doesn't exist or needs more params. 
            // If it's 200, we hit gold.
            // If it returns HTML error, it's 404/500 usually but with 200 status sometimes in ASP.NET
            console.log(`Method: ${method}, Status: ${res.statusCode}, Length: ${data.length}`);
            console.log(`Body: ${data.substring(0, 200)}`);
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with ${method}: ${e.message}`);
    });

    req.end();
});
