const http = require('http');

const params = new URLSearchParams({
    aVuzID: '11927',
    aFacultyID: '"LEMCCKL238XH"', // Quoted as per previous success on other endpoints? Or try raw? 
    // Proxy.php sends raw get query. 
    // Browser sends quoted string in JSON? No, GET params are strings.
    // "LEMCCKL238XH" (with quotes) seems to be the format used by the site?
    // Let's try QUOTED first.
    aEducationForm: '"1"',
    aCourse: '"1"',
    aGiveStudyTimes: 'false'
});

const url = `http://vnz.osvita.net/WidgetSchedule.asmx/GetStudyGroups?${params.toString()}`;

console.log("Fetching: " + url);

http.get(url, (res) => {
    console.log("Status:", res.statusCode);
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log(data.substring(0, 500)));
});
