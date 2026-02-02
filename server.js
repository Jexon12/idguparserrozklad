const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/';

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
    // 1. Serve Static Files (index.html, styles)
    if (req.url === '/' || !req.url.startsWith('/api/')) {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        filePath = path.join(__dirname, filePath);

        const ext = path.extname(filePath);

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code == 'ENOENT') {
                    res.writeHead(404);
                    res.end('File not found');
                } else {
                    res.writeHead(500);
                    res.end('Server error');
                }
            } else {
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
                res.end(content, 'utf-8');
            }
        });
        return;
    }

    // 2. Local API Logic (Global Links)
    if (req.url === '/api/links' || req.url.startsWith('/api/links?')) {
        const LINKS_FILE = path.join(__dirname, 'data', 'links.json');

        // Ensure data dir exists
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data'));
        }

        if (req.method === 'GET') {
            fs.readFile(LINKS_FILE, 'utf8', (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end('{}'); // Empty init
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    }
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(data || '{}');
                }
            });
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const payload = JSON.parse(body);
                    const { password, key, value } = payload;

                    // Simple Auth
                    if (password !== 'admin123') { // TODO: Env var
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Wrong password' }));
                        return;
                    }

                    // Read existing
                    let links = {};
                    if (fs.existsSync(LINKS_FILE)) {
                        try {
                            links = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
                        } catch (e) { links = {}; }
                    }

                    // Update
                    if (value === null) {
                        delete links[key];
                    } else {
                        links[key] = value;
                    }

                    // Save
                    fs.writeFile(LINKS_FILE, JSON.stringify(links, null, 2), (err) => {
                        if (err) {
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: 'Save failed' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ success: true }));
                        }
                    });

                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }
    }

    // 3. API Proxy Logic (Osvita)
    if (req.url.startsWith('/api/')) {
        const parsedUrl = url.parse(req.url, true);
        const action = parsedUrl.pathname.replace('/api/', ''); // e.g. "GetStudentScheduleFiltersData"
        const queryParams = new URLSearchParams(parsedUrl.query).toString();

        const targetUrl = `${API_URL}${action}${queryParams ? '?' + queryParams : ''}`;

        console.log(`[Proxy] Forwarding to: ${targetUrl}`);

        try {
            const fetch = (await import('node-fetch')).default;

            const apiRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'http://wp-fuaid.zzz.com.ua/', // Critical: Mimic allowed referer
                    'Content-Type': 'application/json'
                }
            });

            const data = await apiRes.text();

            if (!apiRes.ok) {
                console.error(`[Proxy Error] Status: ${apiRes.status}`);
                console.error(`[Proxy Response]: ${data}`);
            }

            res.writeHead(apiRes.status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);

        } catch (error) {
            console.error('Proxy Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy request failed' }));
        }
    }
});

console.log(`Server running at http://localhost:${PORT}/`);
server.listen(PORT);
