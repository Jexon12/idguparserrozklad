const fetch = require('node-fetch');

// Global DB Clients (Lazy init) needed for Serverless function cold starts
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

module.exports = async (req, res) => {
    // Helper to allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // Determine path
    // Vercel might pass full URL or rewritten path. 
    // Construct URL object to be safe.
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = (urlObj.pathname || '').toLowerCase();

    console.log(`[Vercel API] Method: ${req.method} Path: ${pathname}`);

    // =========================================================
    // ROUTE 1: DATABASE (Links)
    // =========================================================
    // Check if path contains 'links'. Vercel rewrite might make it /api/links or just /links
    if (pathname.includes('/links')) {

        try {
            const db = await getDb();

            if (req.method === 'GET') {
                let data = '{}';
                if (db) {
                    if (db.type === 'kv') {
                        const remote = await db.client.get('links');
                        if (remote) data = JSON.stringify(remote);
                    } else if (db.type === 'redis') {
                        const remoteStr = await db.client.get('links');
                        if (remoteStr) data = remoteStr;
                    }
                }
                // Note: No local file fallback in Vercel environment (read-only FS usually)
                res.status(200).json(data ? JSON.parse(data) : {});
                return;
            }

            if (req.method === 'POST') {
                // Vercel automatically parses JSON body if Content-Type is application/json
                const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

                if (!payload) {
                    res.status(400).json({ error: 'Missing body' });
                    return;
                }

                const { password, key, value } = payload;

                if (password !== 'admin123') {
                    res.status(403).json({ error: 'Wrong password' });
                    return;
                }

                // READ OLD
                let links = {};
                if (db) {
                    let str;
                    if (db.type === 'kv') {
                        const obj = await db.client.get('links');
                        links = obj || {};
                    } else if (db.type === 'redis') {
                        str = await db.client.get('links');
                        try { links = str ? JSON.parse(str) : {}; } catch (e) { }
                    }
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
                    res.status(200).json({ success: true, storage: db.type });
                } else {
                    res.status(500).json({ error: 'No database connection available on Vercel' });
                }
                return;
            }

        } catch (e) {
            console.error("Vercel API DB Error:", e);
            res.status(500).json({ error: e.message });
            return;
        }
    }

    // =========================================================
    // ROUTE 2: PROXY (Osvita)
    // =========================================================

    // Safety check: Don't proxy 'links'
    const action = pathname.split('/').pop();
    if (action.startsWith('links')) {
        res.status(404).json({ error: 'Endpoint not found' });
        return;
    }

    const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/';
    const search = urlObj.search;
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
        // Proxy headers if needed, but Vercel handles most
        res.send(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy request failed' });
    }
};
