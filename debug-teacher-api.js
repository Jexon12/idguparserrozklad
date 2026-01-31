const http = require('http');

async function get(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ code: res.statusCode, body: data }));
        });
        req.end();
    });
}

async function run() {
    console.log("1. Get Chairs...");
    const chairsRes = await get('/api/GetEmployeeChairs?aVuzID=11927&aGiveStudyTimes=true&aFacultyID=%227FR9L1MPGGWN%22');
    console.log(`Chairs Status: ${chairsRes.code}`);
    if (chairsRes.code !== 200) {
        console.log("Failed to get chairs");
        return;
    }
    const chairsData = JSON.parse(chairsRes.body).d;
    // console.log(chairsData);

    if (!chairsData.chairs || chairsData.chairs.length === 0) {
        console.log("No chairs found");
        return;
    }

    const chairID = chairsData.chairs[0].Key;
    console.log(`Using ChairID: ${chairID}`);

    console.log("2. Get Employees...");
    // index.html: GetEmployees(aFacultyID, aChairID)
    const empRes = await get(`/api/GetEmployees?aVuzID=11927&aGiveStudyTimes=true&aFacultyID=%227FR9L1MPGGWN%22&aChairID=%22${chairID}%22`);
    console.log(`Employees Status: ${empRes.code}`);
    console.log(`Body: ${empRes.body.substring(0, 200)}...`);
}

run();
