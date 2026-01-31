const http = require('http');

// GroupID: Q6U0PEYHJER7
// Dates: 01.09.2023 - 07.09.2023 (example)
// Action: GetScheduleDataX
// Params: aVuzID (auto), aStudyGroupID, aStartDate, aEndDate, aStudyTypeID=""

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/GetScheduleDataX?aVuzID=11927&aStudyGroupID=%22Q6U0PEYHJER7%22&aStartDate=%2201.09.2023%22&aEndDate=%2207.09.2023%22&aStudyTypeID=%22%22',
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
