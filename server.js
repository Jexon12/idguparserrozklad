// Load environment variables locally
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Fallback to .env

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Import the Vercel API handler
const apiHandler = require('./api/index');

const PORT = 3000;

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
    // Parse URL
    const parsedUrl = url.parse(req.url, true);
    // Lowercase path to be robust (some servers normalize differently)
    const pathname = (parsedUrl.pathname || '/').toLowerCase();

    console.log(`[Request] Method: ${req.method} Path: ${pathname}`);

    // =========================================================
    // API ROUTES -> Delegate to api/index.js
    // =========================================================
    if (pathname.startsWith('/api/')) {

        // 1. Shim Response Object (Vercel/Express style helpers)
        res.status = (code) => {
            res.statusCode = code;
            return res;
        };
        res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
        };
        res.send = (data) => {
            res.end(data);
            return res;
        };

        // 2. Body Parsing (if POST/PUT)
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    // Try to parse JSON if content-type says so, or just attach string
                    // simple heuristic: if it looks like JSON, parse it
                    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                        try {
                            req.body = JSON.parse(body);
                        } catch (e) {
                            req.body = body;
                        }
                    } else {
                        req.body = body;
                    }

                    // Call the handler
                    await apiHandler(req, res);
                } catch (e) {
                    console.error("API Handler Error", e);
                    if (!res.writableEnded) res.status(500).json({ error: e.message });
                }
            });
        } else {
            // GET/DELETE/OPTIONS -> Call immediately
            try {
                await apiHandler(req, res);
            } catch (e) {
                console.error("API Handler Error", e);
                if (!res.writableEnded) res.status(500).json({ error: e.message });
            }
        }
        return;
    }

    // =========================================================
    // STATIC FILES
    // =========================================================
    let filePath = pathname === '/' ? '/index.html' : pathname;
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
});

console.log(`Attempting to bind to port ${PORT}...`);

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error('Address in use, retrying...');
        setTimeout(() => {
            server.close();
            server.listen(PORT);
        }, 1000);
    } else {
        console.error('Server error:', e);
    }
});

server.listen(PORT, () => {
    console.log(`Server successfully started and listening at http://localhost:${PORT}/`);
});



