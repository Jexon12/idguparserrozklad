const fetch = require('node-fetch');

module.exports = async (req, res) => {
    const { url } = req;

    // Parse action from URL (Vercel rewrite makes requests hit this file)
    // Url will be /api/GetSomething...
    // We need to extract "GetSomething" and query params.

    // Base API URL
    const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/';

    // Extract part after /api/
    // req.url might be ending in /api/Action?params...
    // simpler: use query params passed by Vercel or parse full URL

    const urlObj = new URL(url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname; // /api/Action
    const action = pathname.split('/').pop(); // Action
    const search = urlObj.search; // ?aVuzID=...

    const targetUrl = `${API_URL}${action}${search}`;

    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

    try {
        const apiRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'http://wp-fuaid.zzz.com.ua/',
                'Content-Type': 'application/json'
            }
        });

        const data = await apiRes.text();

        res.status(apiRes.status);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy request failed' });
    }
};
