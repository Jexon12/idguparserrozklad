// Load environment variables locally
require('dotenv').config({ path: '.env.local' });
require('dotenv').config(); // Fallback to .env

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

// Import the Vercel API handler
const apiHandler = require('./api/index');

const PORT = 3000;

// MIME types for static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

// Compressible MIME types
const COMPRESSIBLE = new Set(['text/html', 'text/css', 'text/javascript', 'application/json']);

// --- In-memory static file cache ---
const fileCache = new Map();

function getStaticFile(filePath) {
    const cached = fileCache.get(filePath);
    if (cached) {
        // Check if file was modified
        try {
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs === cached.mtimeMs) {
                return cached;
            }
        } catch (e) { return null; }
    }

    try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mime = MIME_TYPES[ext] || 'text/plain';

        // Pre-compress if text
        let gzipped = null;
        if (COMPRESSIBLE.has(mime) && content.length > 256) {
            gzipped = zlib.gzipSync(content);
        }

        const entry = {
            content,
            gzipped,
            mime,
            mtimeMs: stat.mtimeMs,
            etag: `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`,
            isCompressible: COMPRESSIBLE.has(mime)
        };

        fileCache.set(filePath, entry);
        return entry;
    } catch (e) {
        return null;
    }
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
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
            const json = JSON.stringify(data);
            const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');

            res.setHeader('Content-Type', 'application/json');
            if (acceptsGzip && json.length > 256) {
                res.setHeader('Content-Encoding', 'gzip');
                res.end(zlib.gzipSync(json));
            } else {
                res.end(json);
            }
            return res;
        };
        res.send = (data) => {
            const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
            if (acceptsGzip && typeof data === 'string' && data.length > 256) {
                res.setHeader('Content-Encoding', 'gzip');
                res.end(zlib.gzipSync(data));
            } else {
                res.end(data);
            }
            return res;
        };

        // 2. Body Parsing (if POST/PUT)
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', async () => {
                try {
                    if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
                        try {
                            req.body = JSON.parse(body);
                        } catch (e) {
                            req.body = body;
                        }
                    } else {
                        req.body = body;
                    }
                    await apiHandler(req, res);
                } catch (e) {
                    console.error("API Handler Error", e);
                    if (!res.writableEnded) res.status(500).json({ error: e.message });
                }
            });
        } else {
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
    // STATIC FILES — with caching, ETags, and gzip
    // =========================================================
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    const file = getStaticFile(filePath);

    if (!file) {
        res.writeHead(404);
        res.end('File not found');
        return;
    }

    // ETag / 304 Not Modified
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === file.etag) {
        res.writeHead(304);
        res.end();
        return;
    }

    const headers = {
        'Content-Type': file.mime,
        'ETag': file.etag
    };

    // Cache-Control: HTML = no-cache (always revalidate), others = 1 hour
    if (file.mime === 'text/html') {
        headers['Cache-Control'] = 'no-cache';
    } else {
        headers['Cache-Control'] = 'public, max-age=3600';
    }

    // gzip if client accepts and file is compressible
    const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    if (acceptsGzip && file.gzipped) {
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        res.end(file.gzipped);
    } else {
        res.writeHead(200, headers);
        res.end(file.content);
    }
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

const serverInstance = server.listen(PORT, () => {
    console.log(`Server successfully started and listening at http://localhost:${PORT}/`);
});

// Graceful Custom Shutdown
const shutdown = () => {
    console.log('Received kill signal, shutting down gracefully');
    serverInstance.close(() => {
        console.log('Closed out remaining connections');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
