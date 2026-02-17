
async function testApi() {
    const teacherId = 'I9D5X0DC3PWM';
    const startDate = '01.02.2026';
    const endDate = '28.02.2026';
    const url = `http://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataEmp?aVuzID=11927&aEmployeeID=${teacherId}&aStartDate=${startDate}&aEndDate=${endDate}&aStudyTypeID=&aGiveStudyTimes=true`;

    console.log("Fetching:", url);
    try {
        const res = await fetch(url);
        console.log("Status:", res.status);
        if (!res.ok) {
            console.log("Error Body:", await res.text());
        } else {
            const json = await res.json();
            console.log("Success! Items:", (json.d || json).length);
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testApi();
