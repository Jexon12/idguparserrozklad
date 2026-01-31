const http = require('http');

// Emulate: 
// aFacultyID="LEMCCKL238XH"
// aEducationForm=""
// aCourse=""

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/GetStudyGroups?aVuzID=11927&aGiveStudyTimes=true&aFacultyID=%22LEMCCKL238XH%22&aEducationForm=%22%22&aCourse=%22%22',
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log('BODY: ' + data.substring(0, 500) + '...');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.end();
