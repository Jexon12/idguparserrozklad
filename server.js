// Load environment variables locally
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Fallback to .env

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

// Global DB Clients (Lazy init)
let kvClient = null;
let redisClient = null;

const getDb = async () => {
    // 1. Vercel KV (@vercel/kv) - HTTP based
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        if (!kvClient) {
            try {
                kvClient = require('@vercel/kv').kv;
            } catch (e) { console.error("KV init error", e); }
        }
        if (kvClient) return { type: 'kv', client: kvClient };
    }

    // 2. Standard Redis (redis package) - TCP based
    if (process.env.REDIS_URL) {
        if (!redisClient) {
            try {
                const { createClient } = require('redis');
                redisClient = createClient({ url: process.env.REDIS_URL });
                redisClient.on('error', (err) => console.error('Redis Client Error', err));
                await redisClient.connect();
            } catch (e) {
                console.error("Redis init error", e);
                redisClient = null;
            }
        }
        if (redisClient && redisClient.isOpen) return { type: 'redis', client: redisClient };
    }

    return null;
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

    // 2. Data Persistence (Links & Notes)
    if (req.url === '/api/links' || req.url.startsWith('/api/links?')) {

        const db = await getDb();
        const LINKS_FILE = path.join(__dirname, 'data', 'links.json');

        if (req.method === 'GET') {
            try {
                let data = '{}';

                if (db) {
                    if (db.type === 'kv') {
                        const remote = await db.client.get('links');
                        if (remote) data = JSON.stringify(remote);
                    } else if (db.type === 'redis') {
                        const remoteStr = await db.client.get('links');
                        if (remoteStr) data = remoteStr;
                    }
                } else if (fs.existsSync(LINKS_FILE)) {
                    // Fallback to local
                    data = fs.readFileSync(LINKS_FILE, 'utf8');
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(data || '{}');

            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body);
                    const { password, key, value } = payload;

                    if (password !== 'admin123') {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Wrong password' }));
                        return;
                    }

                    // READ OLD
                    let links = {};
                    if (db) {
                        let str;
                        if (db.type === 'kv') {
                            const obj = await db.client.get('links');
                            // KV returns obj automatically?
                            links = obj || {};
                        } else if (db.type === 'redis') {
                            str = await db.client.get('links');
                            try { links = str ? JSON.parse(str) : {}; } catch (e) { }
                        }
                    } else if (fs.existsSync(LINKS_FILE)) {
                        try {
                            links = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
                        } catch (e) { links = {}; }
                    }

                    // UPDATE
                    if (value === null) {
                        delete links[key];
                    } else {
                        links[key] = value;
                    }

                    // SAVE
                    if (db) {
                        if (db.type === 'kv') {
                            await db.client.set('links', links);
                        } else if (db.type === 'redis') {
                            await db.client.set('links', JSON.stringify(links));
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: true, storage: db.type }));
                    } else {
                        // LOCAL SAVE
                        if (!fs.existsSync(path.join(__dirname, 'data'))) {
                            fs.mkdirSync(path.join(__dirname, 'data'));
                        }
                        fs.writeFile(LINKS_FILE, JSON.stringify(links, null, 2), (err) => {
                            if (err) {
                                res.writeHead(500);
                                res.end(JSON.stringify({ error: 'Local FS Save failed: ' + err.message }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                                res.end(JSON.stringify({ success: true, storage: 'local' }));
                            }
                        });
                    }

                } catch (e) {
                    console.error(e);
                } catch (e) {
                    console.error("Server API Error:", e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    // Return connection details to help debug
                    const dbStatus = db ? `Connected to ${db.type}` : 'No DB (using Local FS)';
                    res.end(JSON.stringify({ error: `Internal Error: ${e.message}. DB Status: ${dbStatus}` }));
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
