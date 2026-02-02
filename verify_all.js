const http = require('http');

const VUZ_ID = 11927;
const API_HOST = 'vnz.osvita.net';

const fetchApi = (action, params = {}) => {
    return new Promise((resolve, reject) => {
        const query = new URLSearchParams({
            aVuzID: VUZ_ID,
            callback: 'jsonp' + Date.now(),
            _: Date.now(),
            ...params
        });

        // Add quotes if needed (Node doesn't do it automatically for values)
        // Actually, URLSearchParams encodes. The site expects quoted strings e.g. "1" not 1.
        // We need to be careful. The previous successful test manually quoted.

        // Let's replicate the manual quoting from index.html logic if we were building the string manually.
        // But URLSearchParams will encode "1" as %221%22. If the server expects that, good.
        // Previous index.html quoted values before appending.

        const path = `/WidgetSchedule.asmx/${action}?${query.toString()}`;
        console.log(`fetching ${path}`);

        const req = http.request({
            hostname: API_HOST,
            path: path,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'http://wp-fuaid.zzz.com.ua/'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`Error ${res.statusCode}: ${data}`);
                    resolve(null);
                    return;
                }
                // Parse JSONP
                const match = data.match(/^\s*([a-zA-Z0-9_]+)\s*\((.*)\)\s*;?\s*$/s);
                if (match) {
                    try {
                        const json = JSON.parse(match[2]);
                        resolve(json.d || json);
                    } catch (e) {
                        console.error("JSON Parse Error", e);
                        resolve(null);
                    }
                } else {
                    // Try plain JSON
                    try {
                        const json = JSON.parse(data);
                        resolve(json.d || json);
                    } catch (e) {
                        console.error("Not JSON/JSONP", data.substring(0, 100));
                        resolve(null);
                    }
                }
            });
        });

        req.on('error', e => {
            console.error(e);
            resolve(null);
        });
        req.end();
    });
};

const run = async () => {
    console.log("--- 1. GetStudyGroups ---");
    // We need a known Faculty ID. I'll use one from previous logs or fetch it.
    // Let's hardcode one for safety: "LEMCCKL238XH" (seen in test_api.js)
    const facId = '"LEMCCKL238XH"'; // Manually quoted as per index.html logic

    // Note: index.html logic: url.searchParams.append(key, quoteIfNeeded(value));
    // So if I pass quoted string to URLSearchParams, it gets encoded as %22...%22
    // Which is correct for the server.

    const groups = await fetchApi('GetStudyGroups', {
        aFacultyID: facId,
        aEducationForm: '"1"',
        aCourse: '"1"',
        aGiveStudyTimes: 'false'
    });

    if (!groups || !groups.studyGroups) {
        console.error("FAILED to get groups");
        return;
    }

    console.log(`Got ${groups.studyGroups.length} groups.`);
    const textGroup = groups.studyGroups[0];
    console.log("Testing group:", textGroup.Value, textGroup.Key);

    console.log("\n--- 2. GetScheduleDataX ---");
    const today = new Date().toISOString().split('T')[0];
    const data = await fetchApi('GetScheduleDataX', {
        aStudyGroupID: `"${textGroup.Key}"`,
        aStartDate: `"${today}"`,
        aEndDate: `"${today}"`,
        aStudyTypeID: '""',
        aGiveStudyTimes: 'true'
    });

    if (!data) {
        console.error("FAILED to get schedule");
    } else {
        console.log(`Got schedule data: ${data.length} items`);
        if (data.length > 0) {
            console.log("Example lesson:", data[0].discipline || data[0]);
        } else {
            console.log("Schedule empty (normal for some days).");
        }
    }

    console.log("\n--- VERIFICATION COMPLETE ---");
};

run();
