let fetchImpl = require('node-fetch');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const DB_FILE = path.join(__dirname, '../db.json');
const SESSION_FALLBACK_FILE = path.join(__dirname, '../data/session-2025-26.json');
const _rawAdmin = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = (_rawAdmin && _rawAdmin !== 'admin123' && _rawAdmin.length >= 8)
    ? _rawAdmin
    : (process.env.NODE_ENV === 'production' ? null : 'admin123');

// University ID вЂ” single source of truth
const VUZ_ID = process.env.VUZ_ID || 11927;

// --- Proxy cache: Redis/KV when available, else in-memory ---
const proxyCache = new Map();
const inFlightProxyRequests = new Map();
// --- Report jobs (progress flow) ---
const reportJobs = new Map();
const REPORT_JOB_TTL = 10 * 60 * 1000;
const CACHE_TTL = {
    default: 5 * 60 * 1000,    // 5 minutes for filters, groups, teachers
    schedule: 3 * 60 * 1000    // 3 minutes for schedule data
};
const MAX_CACHE_SIZE = 500; // Max entries to prevent memory leak
const rateLimitStore = new Map();
const RATE_LIMITS = {
    adminPost: { windowMs: 60 * 1000, max: 20 },
    proxy: { windowMs: 60 * 1000, max: 120 }
};

function getClientIp(req) {
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    if (xff) return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(bucket, key, config) {
    const now = Date.now();
    const storeKey = `${bucket}:${key}`;
    const existing = rateLimitStore.get(storeKey);
    const resetAt = now + config.windowMs;

    if (!existing || now > existing.resetAt) {
        rateLimitStore.set(storeKey, { count: 1, resetAt });
        return { allowed: true, remaining: config.max - 1, resetAt };
    }

    existing.count += 1;
    if (existing.count > config.max) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    return { allowed: true, remaining: config.max - existing.count, resetAt: existing.resetAt };
}

function enforceRateLimit(req, res, bucket, config) {
    const ip = getClientIp(req);
    const result = checkRateLimit(bucket, ip, config);
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
        const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfterSec);
        res.status(429).json({ error: 'Too many requests' });
        return false;
    }

    return true;
}

async function getCachedProxy(url) {
    const db = await getDb();
    const cacheKey = 'proxy:' + Buffer.from(url).toString('base64url');
    const ttlMs = url.toLowerCase().includes('getscheduledata') ? CACHE_TTL.schedule : CACHE_TTL.default;

    if (db) {
        try {
            let raw;
            if (db.type === 'kv') raw = await db.client.get(cacheKey);
            else if (db.type === 'redis') raw = await db.client.get(cacheKey);
            if (raw != null) {
                const entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (entry && entry.data != null && Date.now() - (entry.timestamp || 0) < ttlMs)
                    return entry;
            }
        } catch (e) { /* fallback to memory */ }
    }
    const entry = proxyCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
        proxyCache.delete(url);
        return null;
    }
    return entry;
}

async function setCachedProxy(url, data, statusCode, isSchedule) {
    const entry = { data, statusCode, timestamp: Date.now(), ttl: isSchedule ? CACHE_TTL.schedule : CACHE_TTL.default };
    const db = await getDb();
    const cacheKey = 'proxy:' + Buffer.from(url).toString('base64url');
    const ttlSec = Math.floor(entry.ttl / 1000);

    if (db && ttlSec > 0) {
        try {
            if (db.type === 'kv') await db.client.set(cacheKey, entry, { ex: ttlSec });
            else if (db.type === 'redis') await db.client.set(cacheKey, JSON.stringify(entry), { EX: ttlSec });
        } catch (e) { /* fallback to memory */ }
    }
    if (proxyCache.size >= MAX_CACHE_SIZE) {
        const firstKey = proxyCache.keys().next().value;
        proxyCache.delete(firstKey);
    }
    proxyCache.set(url, entry);
}

async function getOrCreateInFlightProxy(cacheKey, producer) {
    if (inFlightProxyRequests.has(cacheKey)) {
        return inFlightProxyRequests.get(cacheKey);
    }

    const p = (async () => {
        try {
            return await producer();
        } finally {
            inFlightProxyRequests.delete(cacheKey);
        }
    })();

    inFlightProxyRequests.set(cacheKey, p);
    return p;
}

/** Strip cache-buster params to normalize the cache key */
function normalizeProxyCacheKey(targetUrl) {
    const u = new URL(targetUrl);
    u.searchParams.delete('callback');
    u.searchParams.delete('_');
    return u.toString();
}

// Helper for local DB
const getLocalDb = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Local DB Read Error", e);
    }
    return {};
};

const saveLocalDb = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error("Local DB Write Error", e);
        return false;
    }
};

// Global DB Clients (Lazy init) needed for Serverless function cold starts
let kvClient = null;
let redisClient = null;
let redisConnecting = false; // #8 guard against race condition

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
        if (!redisClient && !redisConnecting) {
            redisConnecting = true;
            try {
                const { createClient } = require('redis');
                redisClient = createClient({ url: process.env.REDIS_URL });
                redisClient.on('error', (err) => console.error('Redis Client Error', err));
                await redisClient.connect();
            } catch (e) {
                console.error("Redis init error", e);
                redisClient = null;
            } finally {
                redisConnecting = false;
            }
        }
        if (redisClient && redisClient.isOpen) return { type: 'redis', client: redisClient };
    }

    return null;
};

const apiHandler = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    // Determine path
    // Vercel might pass full URL or rewritten path. 
    // Construct URL object to be safe.
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = (urlObj.pathname || '').toLowerCase();

    // Helper to allow CORS вЂ” restrict for admin mutations
    const origin = req.headers.origin || '';
    // #21: strict pathname match for CORS instead of .includes()
    const isAdminPost = req.method === 'POST' && (
        pathname === '/api/times' ||
        pathname === '/api/links' ||
        pathname === '/api/session'
    );

    if (isAdminPost) {
        // For admin endpoints, only allow same-origin or specific origins
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        // If no origin header (same-origin request), browser won't enforce CORS
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    console.log(`[Vercel API] Method: ${req.method} Path: ${pathname}`);

    // ROUTE: Health Check
    // =========================================================
    if (pathname === '/api/health') {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        return;
    }

    // =========================================================
    // ROUTE: Global Times (/api/times)
    // =========================================================
    if (pathname === '/api/times') {
        const db = await getDb();
        // Fallback to local file if no cloud DB
        const useLocal = !db;

        if (req.method === 'GET') {
            let times = {};
            if (useLocal) {
                const localData = getLocalDb();
                times = localData.times || {};
            } else {
                if (db.type === 'kv') {
                    times = await db.client.get('times') || {};
                } else if (db.type === 'redis') {
                    const str = await db.client.get('times');
                    times = str ? JSON.parse(str) : {};
                }
            }
            res.status(200).json(times);
            return;
        }

        if (req.method === 'POST') {
            if (!enforceRateLimit(req, res, 'admin-post-times', RATE_LIMITS.adminPost)) {
                return;
            }
            if (!ADMIN_PASSWORD) {
                res.status(503).json({ error: 'Admin panel disabled: set ADMIN_PASSWORD (8+ chars, not admin123) in production' });
                return;
            }
            let payload;
            try {
                payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                console.log("Payload parsed:", payload ? "OK" : "NULL");
            } catch (e) {
                console.error("Payload parse error:", e);
                res.status(400).json({ error: 'Invalid JSON body: ' + e.message });
                return;
            }

            if (!payload) {
                res.status(400).json({ error: 'Missing body' });
                return;
            }

            const { password, times } = payload;
            if (password !== ADMIN_PASSWORD) {
                console.log("Wrong password");
                res.status(403).json({ error: 'Wrong password' });
                return;
            }

            // #22: If 'times' is undefined, treat it as a password check only (don't overwrite)
            if (times === undefined) {
                res.status(200).json({ success: true, message: 'Password valid' });
                return;
            }

            try {
                if (useLocal) {
                    const data = getLocalDb();
                    data.times = times;
                    if (!saveLocalDb(data)) {
                        throw new Error("Failed to write local DB");
                    }
                } else {
                    if (db.type === 'kv') {
                        await db.client.set('times', times);
                    } else if (db.type === 'redis') {
                        await db.client.set('times', JSON.stringify(times));
                    }
                }
                res.status(200).json({ success: true });
            } catch (e) {
                console.error("DB Save Error:", e);
                res.status(500).json({ error: 'Database error: ' + e.message });
            }
            return;
        }
    }

    // =========================================================
    // ROUTE: DATABASE (Links)
    // =========================================================
    if (pathname === '/api/links') {

        try {
            const db = await getDb();

            if (req.method === 'GET') {
                // #26: Fixed double JSON.parse for KV
                let dataObj = {};
                if (db) {
                    if (db.type === 'kv') {
                        dataObj = await db.client.get('links') || {};
                    } else if (db.type === 'redis') {
                        const remoteStr = await db.client.get('links');
                        if (remoteStr) {
                            try { dataObj = JSON.parse(remoteStr); } catch (e) { }
                        }
                    }
                }
                // Note: No local file fallback in Vercel environment (read-only FS usually)
                res.status(200).json(dataObj);
                return;
            }

            if (req.method === 'POST') {
                if (!enforceRateLimit(req, res, 'admin-post-links', RATE_LIMITS.adminPost)) {
                    return;
                }
                if (!ADMIN_PASSWORD) {
                    res.status(503).json({ error: 'Admin panel disabled: set ADMIN_PASSWORD in production' });
                    return;
                }
                const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

                if (!payload) {
                    res.status(400).json({ error: 'Missing body' });
                    return;
                }

                const { password, key, value } = payload;

                if (password !== ADMIN_PASSWORD) {
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
    // ROUTE: Session Data (/api/session)
    // =========================================================
    if (pathname === '/api/session') {
        try {
            if (req.method === 'GET') {
                const loaded = await loadSessionData();
                res.status(200).json({
                    ...loaded.data,
                    storage: loaded.storage
                });
                return;
            }

            if (req.method === 'POST') {
                if (!enforceRateLimit(req, res, 'admin-post-session', RATE_LIMITS.adminPost)) {
                    return;
                }
                if (!ADMIN_PASSWORD) {
                    res.status(503).json({ error: 'Admin panel disabled: set ADMIN_PASSWORD in production' });
                    return;
                }

                const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                if (!payload) {
                    res.status(400).json({ error: 'Missing body' });
                    return;
                }

                const { password, data } = payload;
                if (password !== ADMIN_PASSWORD) {
                    res.status(403).json({ error: 'Wrong password' });
                    return;
                }
                if (!data || !Array.isArray(data.items)) {
                    res.status(400).json({ error: 'Invalid session payload (items[])' });
                    return;
                }

                const normalized = {
                    sourceFile: data.sourceFile || '',
                    generatedAt: data.generatedAt || new Date().toISOString(),
                    term: data.term || 'Session',
                    items: data.items
                };

                const storage = await saveSessionData(normalized);
                res.status(200).json({ success: true, storage, count: normalized.items.length });
                return;
            }
        } catch (e) {
            console.error('Session API error', e);
            res.status(500).json({ error: e.message });
            return;
        }
    }

    // =========================================================
    // ROUTE: Search (/api/search?q=...)
    // =========================================================
    if (pathname === '/api/search' && req.method === 'GET') {
        const q = (urlObj.searchParams.get('q') || '').toLowerCase().trim();
        if (!q || q.length < 2) {
            res.status(400).json({ error: 'Query too short (min 2 chars)' });
            return;
        }

        // Check Redis cache first
        const db = await getDb();
        const cacheKey = 'search_cache';
        let cached = null;

        if (db) {
            try {
                if (db.type === 'kv') {
                    cached = await db.client.get(cacheKey);
                } else if (db.type === 'redis') {
                    const str = await db.client.get(cacheKey);
                    try { cached = str ? JSON.parse(str) : null; } catch (e) { }
                }
            } catch (e) { /* ignore cache errors */ }
        }

        if (cached && Array.isArray(cached)) {
            // Filter cached items
            const results = cached
                .filter(item => item.label.toLowerCase().includes(q))
                .sort((a, b) => {
                    const aStarts = a.label.toLowerCase().startsWith(q);
                    const bStarts = b.label.toLowerCase().startsWith(q);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    return 0;
                })
                .slice(0, 15);
            res.status(200).json(results);
        } else {
            // No cache вЂ” return empty, client handles client-side search
            res.status(200).json([]);
        }
        return;
    }

    // =========================================================
    // ROUTE: Report Start (POST) вЂ” two-phase with progress
    // =========================================================
    if (pathname === '/api/report/start' && req.method === 'POST') {
        // #2 fix: declare payload with let
        let payload;
        try { payload = (req.body && typeof req.body === 'object') ? req.body : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : {}); } catch (e) { payload = {}; }
        const { facultyName = 'Р¤Р°РєСѓР»СЊС‚РµС‚', departmentName = 'РљР°С„РµРґСЂР°', teacherName = '', teacherId = '', monthStart = '', monthEnd = '' } = payload;
        if (!teacherId || !monthStart || !monthEnd) {
            res.status(400).json({ error: 'Missing teacherId, monthStart or monthEnd' });
            return;
        }
        const jobId = 'r' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const job = { status: 'running', current: 0, total: 0, progress: '0/0', done: false, error: null, allSemLessons: [], params: { facultyName, departmentName, teacherName, monthStart, monthEnd }, createdAt: Date.now() };
        reportJobs.set(jobId, job);
        setTimeout(() => { if (reportJobs.has(jobId)) reportJobs.delete(jobId); }, REPORT_JOB_TTL);
        res.status(200).json({ jobId });
        (async () => {
            const getMonthDate = (str) => { const [y, m] = str.split('-').map(Number); return new Date(y, m - 1, 1); };
            const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
            const startDt = getMonthDate(monthStart);
            const endDt = getMonthDate(monthEnd);
            const loopEnd = new Date(endDt.getFullYear(), endDt.getMonth() + 1, 0);
            const months = [];
            let cur = new Date(startDt);
            while (cur <= loopEnd) { months.push({ year: cur.getFullYear(), month: cur.getMonth(), sheetName: cur.toLocaleString('uk-UA', { month: 'long', year: 'numeric' }), apiStart: formatDate(new Date(cur.getFullYear(), cur.getMonth(), 1)), apiEnd: formatDate(new Date(cur.getFullYear(), cur.getMonth() + 1, 0)) }); cur.setMonth(cur.getMonth() + 1); }
            job.total = months.length;
            const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataEmp';
            for (let i = 0; i < months.length; i++) {
                const m = months[i];
                job.current = i; job.progress = `${i + 1}/${months.length} РјС–СЃСЏС†С–РІ`;
                try {
                    const u = `${API_URL}?aVuzID=${VUZ_ID}&aEmployeeID="${teacherId}"&aStartDate="${m.apiStart}"&aEndDate="${m.apiEnd}"&aStudyTypeID=&aGiveStudyTimes=true`;
                    const controller = new AbortController();
                    const tid = setTimeout(() => controller.abort(), 15000);
                    const apiRes = await fetchImpl(u, { signal: controller.signal });
                    clearTimeout(tid);
                    const raw = await apiRes.json();
                    const lessons = Array.isArray(raw.d) ? raw.d : (Array.isArray(raw) ? raw : []);
                    lessons.forEach(l => job.allSemLessons.push({ ...l, monthObj: new Date(m.year, m.month, 1) }));
                } catch (err) {
                    job.status = 'error';
                    job.error = err.message;
                    job.done = true;
                    return;
                }
            }
            job.status = 'done'; job.done = true; job.progress = `${months.length}/${months.length} РјС–СЃСЏС†С–РІ`;
        })();
        return;
    }

    // =========================================================
    // ROUTE: Report Status (GET) вЂ” progress polling
    // =========================================================
    if (pathname === '/api/report/status' && req.method === 'GET') {
        const jobId = urlObj.searchParams.get('jobId');
        if (!jobId) { res.status(400).json({ error: 'Missing jobId' }); return; }
        const job = reportJobs.get(jobId);
        if (!job) { res.status(404).json({ error: 'Job not found or expired' }); return; }
        res.status(200).json({
            status: job.status,
            current: job.current,
            total: job.total,
            progress: job.progress,
            done: job.done,
            error: job.error,
            downloadUrl: (job.done && job.status === 'done' && !job.error) ? `/api/report/download?jobId=${jobId}` : null
        });
        return;
    }

    // =========================================================
    // ROUTE: Excel Report (/api/report/download)
    // =========================================================
    if (pathname === '/api/report/download' && req.method === 'GET') {
        try {
            const jobId = urlObj.searchParams.get('jobId');
            if (jobId) {
                const job = reportJobs.get(jobId);
                if (!job || !job.done || job.status !== 'done' || job.error) { res.status(404).json({ error: 'Report not ready' }); return; }
                const { facultyName, departmentName, teacherName, monthStart, monthEnd } = job.params;
                const workbook = new ExcelJS.Workbook();
                const monthSheets = {};
                job.allSemLessons.forEach(l => {
                    const m = l.monthObj.getMonth();
                    const y = l.monthObj.getFullYear();
                    const k = `${y}-${m}`;
                    if (!monthSheets[k]) monthSheets[k] = { year: y, month: m, lessons: [], sheetName: new Date(y, m, 1).toLocaleString('uk-UA', { month: 'long', year: 'numeric' }) };
                    monthSheets[k].lessons.push(l);
                });
                Object.values(monthSheets).forEach(({ year, month, sheetName, lessons }) => {
                    const sheet = workbook.addWorksheet(sheetName);
                    generateMonthSheet(sheet, lessons, { facultyName, departmentName, teacherName, year, month });
                });
                const sem1 = job.allSemLessons.filter(l => { const m = l.monthObj.getMonth(); return (m >= 8 && m <= 11) || m === 0; });
                const sem2 = job.allSemLessons.filter(l => { const m = l.monthObj.getMonth(); return m >= 1 && m <= 6; });
                if (sem1.length > 0) { const s = workbook.addWorksheet('Р—РІРµРґРµРЅС– РґР°РЅС– (1 СЃРµРј)'); generateSummarySheet(s, sem1, '1 СЃРµРјРµСЃС‚СЂ'); }
                if (sem2.length > 0) { const s = workbook.addWorksheet('Р—РІРµРґРµРЅС– РґР°РЅС– (2 СЃРµРј)'); generateSummarySheet(s, sem2, '2 СЃРµРјРµСЃС‚СЂ'); }
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`Р—РІС–С‚_${teacherName}_${monthStart}_${monthEnd}.xlsx`)}`);
                await workbook.xlsx.write(res);
                reportJobs.delete(jobId);
                return;
            }
            const facultyName = urlObj.searchParams.get('faculty') || 'Р¤Р°РєСѓР»СЊС‚РµС‚';
            const departmentName = urlObj.searchParams.get('department') || 'РљР°С„РµРґСЂР°';
            const teacherName = urlObj.searchParams.get('teacherName') || '';
            const teacherId = urlObj.searchParams.get('teacherId') || '';
            const monthStartStr = urlObj.searchParams.get('monthStart') || '';
            const monthEndStr = urlObj.searchParams.get('monthEnd') || '';

            if (!teacherId || !monthStartStr || !monthEndStr) {
                res.status(400).json({ error: 'Missing teacherId or date range' });
                return;
            }

            // Create Workbook
            const workbook = new ExcelJS.Workbook();

            // Date Helpers
            const getMonthDate = (str) => {
                const [y, m] = str.split('-').map(Number);
                return new Date(y, m - 1, 1);
            };

            const startDt = getMonthDate(monthStartStr);
            const endDt = getMonthDate(monthEndStr);
            // Ensure we include the full end month
            const loopEnd = new Date(endDt.getFullYear(), endDt.getMonth() + 1, 0);

            // 1. Prepare Fetch Requests
            const requests = [];
            let currentDt = new Date(startDt);

            while (currentDt <= loopEnd) {
                const year = currentDt.getFullYear();
                const month = currentDt.getMonth(); // 0-11
                const sheetName = currentDt.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });

                const startDateObj = new Date(year, month, 1);
                const endDateObj = new Date(year, month + 1, 0);

                const formatDate = (d) => {
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    return `${dd}.${mm}.${yyyy}`;
                };

                const apiStartDate = formatDate(startDateObj);
                const apiEndDate = formatDate(endDateObj);

                // Closure to capture current loop variables
                const fetchMonth = async (mYear, mMonth, mSheetName, mApiStart, mApiEnd) => {
                    const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataEmp';
                    const param = (val) => `"${val}"`;
                    const apiUrlWithParams = `${API_URL}?aVuzID=${VUZ_ID}&aEmployeeID=${param(teacherId)}&aStartDate=${param(mApiStart)}&aEndDate=${param(mApiEnd)}&aStudyTypeID=&aGiveStudyTimes=true`;

                    console.log(`[Report] Fetching ${mSheetName}...`);
                    try {
                        // #16: use AbortController instead of unsupported timeout option
                        const controller = new AbortController();
                        const tid = setTimeout(() => controller.abort(), 15000);
                        const apiRes = await fetchImpl(apiUrlWithParams, { signal: controller.signal });
                        clearTimeout(tid);
                        if (!apiRes.ok) throw new Error(`Status ${apiRes.status}`);
                        const rawData = await apiRes.json();
                        const data = Array.isArray(rawData.d) ? rawData.d : (Array.isArray(rawData) ? rawData : []);
                        return {
                            success: true,
                            year: mYear,
                            month: mMonth,
                            sheetName: mSheetName,
                            lessons: data
                        };
                    } catch (err) {
                        console.error(`[Report] Failed ${mSheetName}:`, err);
                        return { success: false, sheetName: mSheetName, error: err.message };
                    }
                };

                requests.push(fetchMonth(year, month, sheetName, apiStartDate, apiEndDate));

                // Increment month
                currentDt.setMonth(currentDt.getMonth() + 1);
            }

            // 2. Execute Parallel Fetches
            console.log(`[Report] Starting ${requests.length} parallel requests...`);
            const results = await Promise.all(requests);

            // 3. Process Results & Generate Sheets
            const allSemLessons = [];

            // #3 fix: renamed loop variable to avoid shadowing the outer `res` (HTTP response)
            for (const monthResult of results) {
                if (!monthResult.success) continue;

                const { year, month, sheetName, lessons } = monthResult;
                // Add to global list for summary
                lessons.forEach(l => allSemLessons.push({ ...l, monthObj: new Date(year, month, 1) }));

                const sheet = workbook.addWorksheet(sheetName);
                generateMonthSheet(sheet, lessons, { facultyName, departmentName, teacherName, year, month });
            }

            // --- Generate Semester Summaries ---
            const sem1Lessons = allSemLessons.filter(l => {
                const m = l.monthObj.getMonth();
                return (m >= 8 && m <= 11) || m === 0; // Sept(8) - Jan(0)
            });
            const sem2Lessons = allSemLessons.filter(l => {
                const m = l.monthObj.getMonth();
                return (m >= 1 && m <= 6); // Feb(1) - July(6)
            });

            if (sem1Lessons.length > 0) {
                const semSheet = workbook.addWorksheet('Р—РІРµРґРµРЅС– РґР°РЅС– (1 СЃРµРј)');
                generateSummarySheet(semSheet, sem1Lessons, '1 СЃРµРјРµСЃС‚СЂ');
            }
            if (sem2Lessons.length > 0) {
                const semSheet = workbook.addWorksheet('Р—РІРµРґРµРЅС– РґР°РЅС– (2 СЃРµРј)');
                generateSummarySheet(semSheet, sem2Lessons, '2 СЃРµРјРµСЃС‚СЂ');
            }

            // --- Send Response ---
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            const safeName = encodeURIComponent(`Р—РІС–С‚_${teacherName}_${monthStartStr}_${monthEndStr}.xlsx`);
            res.setHeader('Content-Disposition', `attachment; filename="Report.xlsx"; filename*=UTF-8''${safeName}`);

            // #11: ExcelJS closes the stream internally вЂ” no res.end() needed
            await workbook.xlsx.write(res);

        } catch (e) {
            console.error("Report Generation Error:", e);
            res.status(500).json({ error: e.message });
        }
    }

    // Helper: Determine Row Color based on Study Type
    function getRowColor(studyType) {
        const type = (studyType || '').toLowerCase();
        if (type.includes('Р»РµРєС†')) return 'FFFFE0B2'; // Orange-ish
        if (type.includes('Р»Р°Р±')) return 'FFC8E6C9';  // Green-ish
        if (type.includes('РїСЂР°РєС‚')) return 'FFBBDEFB'; // Blue-ish
        if (type.includes('РµРєР·Р°Рј') || type.includes('РєРѕРЅСЃСѓР»СЊС‚')) return 'FFF8BBD0'; // Pink-ish
        return 'FFFFFFFF'; // White
    }

    // Helper: Generate Month Sheet (Strict Layout)
    function generateMonthSheet(sheet, lessons, meta) {
        const { facultyName, departmentName, teacherName, year, month } = meta;

        lessons.sort((a, b) => {
            const da = a.full_date.split('.').reverse().join('-');
            const db = b.full_date.split('.').reverse().join('-');
            return da.localeCompare(db) || a.study_time_begin.localeCompare(b.study_time_begin);
        });

        // Columns setup
        // Columns setup
        // Uniform grid for A-S to support footer stats. T covers Groups.
        const columns = [];
        for (let i = 0; i < 20; i++) {
            if (i === 19) { // T
                columns.push({ width: 20 });
            } else {
                columns.push({ width: 5 });
            }
        }
        sheet.columns = columns;

        // Styles
        const borderStyle = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };
        const centerStyle = { vertical: 'middle', horizontal: 'center', wrapText: true };
        const fontBold = { name: 'Arial', size: 10, bold: true };
        const fontNormal = { name: 'Arial', size: 10 };

        const mergeAndSet = (range, value, font = fontNormal, align = centerStyle, border = true) => {
            sheet.mergeCells(range);
            const cell = sheet.getCell(range.split(':')[0]);
            cell.value = value;
            cell.font = font;
            cell.alignment = align;
            if (border) cell.border = borderStyle;
        };

        // Header Rows 1-7
        mergeAndSet('A1:S2', 'РљРђР РўРљРђ', { name: 'Arial', size: 12, bold: true }, centerStyle, false);

        mergeAndSet('A3:H3', 'РѕР±Р»С–РєСѓ СЂРѕР±РѕС‚Рё РІРёРєР»Р°РґР°С‡Р° РєР°С„РµРґСЂРё', fontNormal, { vertical: 'middle', horizontal: 'right' }, false);
        mergeAndSet('I3:S3', departmentName, { ...fontNormal, italic: true }, { vertical: 'middle', horizontal: 'center', wrapText: true }, false);
        sheet.getCell('I3').border = { bottom: { style: 'thin' } };

        mergeAndSet('A4:D4', 'С„Р°РєСѓР»СЊС‚РµС‚Сѓ', fontNormal, { vertical: 'middle', horizontal: 'right' }, false);
        mergeAndSet('E4:M4', facultyName, { ...fontNormal, italic: true }, { vertical: 'middle', horizontal: 'center', wrapText: true }, false);
        sheet.getCell('E4').border = { bottom: { style: 'thin' } };

        mergeAndSet('N4:O4', 'Р†Р”Р“РЈ ', fontBold, centerStyle, false);

        const monthNames = ["СЃС–С‡РµРЅСЊ", "Р»СЋС‚РёР№", "Р±РµСЂРµР·РµРЅСЊ", "РєРІС–С‚РµРЅСЊ", "С‚СЂР°РІРµРЅСЊ", "С‡РµСЂРІРµРЅСЊ", "Р»РёРїРµРЅСЊ", "СЃРµСЂРїРµРЅСЊ", "РІРµСЂРµСЃРµРЅСЊ", "Р¶РѕРІС‚РµРЅСЊ", "Р»РёСЃС‚РѕРїР°Рґ", "РіСЂСѓРґРµРЅСЊ"];
        const monthText = `${monthNames[month]} ${year}СЂ.`;
        mergeAndSet('P4:S4', monthText, fontNormal, centerStyle, false);
        sheet.getCell('P4').border = { bottom: { style: 'thin' } };

        mergeAndSet('A5:S5', teacherName, { ...fontBold, size: 12, underline: true }, centerStyle, false);

        mergeAndSet('A7:C7', 'Р”Р°С‚Р°', fontBold, centerStyle, true);
        mergeAndSet('D7:N7', 'РќР°Р·РІР° РґРёСЃС†РёРїР»С–РЅРё Р°Р±Рѕ С–РЅС€РѕРіРѕ РѕСЃРІС–С‚РЅСЊРѕРіРѕ РєРѕРјРїРѕРЅРµРЅС‚Сѓ', fontBold, centerStyle, true);
        mergeAndSet('O7:Q7', 'Р’РёРґРё СЂРѕР±С–С‚', fontBold, centerStyle, true);
        mergeAndSet('R7:S7', 'РљС–Р»СЊРєС–СЃС‚СЊ РіРѕРґРёРЅ', fontBold, centerStyle, true);

        // T Header
        const tCell = sheet.getCell('T7');
        tCell.value = 'Р“СЂСѓРїРё';
        tCell.font = fontBold;
        tCell.alignment = centerStyle;
        tCell.border = borderStyle;

        // Data Filling
        let currentRow = 8;
        const normalizeType = (t) => {
            const s = (t || '').toLowerCase();
            if (s.includes('Р»РµРєС†')) return 'Р›РµРєС†С–С—';
            if (s.includes('Р»Р°Р±')) return 'Р›Р°Р±РѕСЂР°С‚РѕСЂРЅС–';
            if (s.includes('РїСЂР°РєС‚')) return 'РџСЂР°РєС‚РёС‡РЅС–';
            if (s.includes('РєРѕРЅСЃСѓР»СЊС‚') && s.includes('РµРєР·Р°Рј')) return 'РµРєР·Р°РјРµРЅ.РєРѕРЅСЃСѓР»СЊС‚Р°С†С–СЏ';
            if (s.includes('РєРѕРЅСЃСѓР»СЊС‚')) return 'РџСЂРѕРІРµРґРµРЅРЅСЏ РєРѕРЅСЃСѓР»СЊС‚Р°С†С–Р№ Р· РґРёСЃС†РёРїР»С–РЅ РїСЂРѕС‚СЏРіРѕРј СЃРµРјРµСЃС‚СЂСѓ';
            if (s.includes('РµРєР·Р°Рј')) return 'РµРєР·Р°РјРµРЅ';
            if (s.includes('Р·Р°Р»С–Рє')) return 'Р·Р°Р»С–Рє';
            return s;
        };

        if (lessons.length > 0) {
            lessons.forEach(l => {
                const r = currentRow;
                const hours = l.study_hours ? Number(l.study_hours) : 2;

                mergeAndSet(`A${r}:C${r}`, l.full_date, fontNormal, centerStyle, true);
                mergeAndSet(`D${r}:N${r}`, l.discipline, fontNormal, { vertical: 'middle', horizontal: 'left', wrapText: true }, true);

                const nType = normalizeType(l.study_type);
                mergeAndSet(`O${r}:Q${r}`, nType, fontNormal, centerStyle, true);
                mergeAndSet(`R${r}:S${r}`, hours, fontNormal, centerStyle, true);

                // Column T: Groups
                const tCell = sheet.getCell(`T${r}`);
                tCell.value = l.contingent || l.group || '';
                tCell.font = fontNormal;
                tCell.alignment = centerStyle;
                tCell.border = borderStyle;

                // Color Coding
                const rowColor = getRowColor(l.study_type);
                if (rowColor !== 'FFFFFFFF') {
                    const fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: rowColor }
                    };
                    // Apply to A-T
                    for (let c = 1; c <= 20; c++) {
                        const colLetter = String.fromCharCode(64 + c); // A=1
                        // Valid for A-T
                        sheet.getCell(`${colLetter}${r}`).fill = fill;
                    }
                }

                currentRow++;
            });
        }

        // Fill blanks
        while (currentRow <= 23) {
            const r = currentRow;
            mergeAndSet(`A${r}:C${r}`, '', fontNormal, centerStyle, true);
            mergeAndSet(`D${r}:N${r}`, '', fontNormal, centerStyle, true);
            mergeAndSet(`O${r}:Q${r}`, '', fontNormal, centerStyle, true);
            mergeAndSet(`R${r}:S${r}`, '', fontNormal, centerStyle, true);
            sheet.getCell(`T${r}`).border = borderStyle;
            currentRow++;
        }

        // --- Footer (Activity Stats) ---
        const dataEndRow = currentRow - 1;
        const footerStartRow = Math.max(23, currentRow);
        const titleRow = footerStartRow;

        mergeAndSet(`A${titleRow}:S${titleRow}`, 'Р’РёРєРѕРЅР°РЅРЅСЏ РЅР°РІС‡Р°Р»СЊРЅРѕРіРѕ РЅР°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РІ РіРѕРґРёРЅР°С… РїРѕ РІРёРґР°С… СЂРѕР±С–С‚', fontNormal, centerStyle, true);

        const hRow = titleRow + 1;
        const statHeaders = [
            'Р§РёС‚Р°РЅРЅСЏ Р»РµРєС†С–Р№', 'РџСЂРІРµРґРµРЅРЅСЏ РїСЂР°РєС‚.Р·Р°РЅСЏС‚СЊ', 'РџСЂРѕРІРµРґРµРЅРЅСЏ Р»Р°Р±РѕСЂ.СЂРѕР±С–С‚', 'РџСЂРІРµРґРµРЅРЅСЏ СЃРµРјС–РЅР°СЂ.Р·Р°РЅСЏС‚СЊ',
            'РџСЂРѕРІРµРґРµРЅРЅСЏ РєРѕРЅСЃСѓР»СЊС‚Р°С†С–Р№ Р· РґРёСЃС†РёРїР»С–РЅ РїСЂРѕС‚СЏРіРѕРј СЃРµРјРµСЃС‚СЂСѓ', 'РљРµСЂС–РІРЅРёС†С‚РІРѕ РїСЂР°РєС‚РёРєРѕСЋ', 'РљРѕРЅСЃСѓР»СЊС‚Р°С†С–СЏ РґРѕ РµРєР·Р°РјРµРЅС–РІ(Р°СѓРґРёС‚РѕСЂРЅС–)',
            'РџСЂРѕРІРµРґРµРЅРЅСЏ РµРєР·Р°РјРµРЅР°С†С–Р№РЅРёС… РєРѕРЅСЃСѓР»СЊС‚Р°С†С–Р№', 'РџРµСЂРµРІС–СЂРєР° РєРѕРЅС‚СЂРѕР»СЊРЅРёС…(РјРѕРґСѓР»СЊРЅРёС…) СЂРѕР±С–С‚', 'РџСЂРѕРјС–Р¶РЅРёР№ (РјРѕРґСѓР»СЊРЅРёР№) РєРѕРЅС‚СЂРѕР»СЊ',
            'СЂРµС„РµСЂР°С‚С–РІ, Р°РЅР°Р»С–С‚РёС‡РЅРёС… РѕРіР»СЏРґС–РІ, РїРµСЂРµРєР»Р°РґС–РІ', 'РіСЂР°С„С–С‡РЅРёС… С‚Р° СЂРѕР·СЂР°С…СѓРЅРєРѕРІРѕ-РіСЂР°С„С–С‡РЅРёС… СЂРѕР±С–С‚', 'РєСѓСЂСЃРѕРІРёС…СЂРѕР±С–С‚(РїСЂРѕРµРєС‚С–РІ)',
            'РџСЂРѕРІРµРґРµРЅРЅСЏ Р·Р°Р»С–РєСѓ', 'РџСЂРѕРІРµРґРµРЅРЅСЏ СЃРµРјРµСЃС‚СЂРѕРІРёС… РµРєР·Р°РјРµРЅС–РІ', 'РџС–РґСЃСѓРјРєРѕРІР° Р°С‚РµСЃС‚Р°С†С–СЏ(РµРєР·Р°РјРµРЅ)', 'Р†РЅРґРёРІС–РґСѓР°Р»СЊРЅС– Р·Р°РЅСЏС‚С‚СЏ',
            'РљРµСЂС–РЅРёС†С‚РІРѕ Р°СЃРїС–СЂР°РЅС‚Р°РјРё', 'РЈСЃСЊРѕРіРѕ'
        ];
        sheet.getRow(hRow).height = 100;
        statHeaders.forEach((txt, idx) => {
            const colLetter = String.fromCharCode(65 + idx);
            const cell = sheet.getCell(`${colLetter}${hRow}`);
            cell.value = txt;
            cell.font = { ...fontNormal, size: 8 };
            cell.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true };
            cell.border = borderStyle;
        });

        const fRow = hRow + 1;
        const formulaCriteria = {
            0: 'Р›РµРєС†С–С—', 1: 'РџСЂР°РєС‚РёС‡РЅС–', 2: 'Р›Р°Р±РѕСЂР°С‚РѕСЂРЅС–', 3: 'СЃРµРј.СЂР°Р±РѕС‚Р°',
            5: 'РїСЂР°РєС‚РёРєР°', 7: 'РµРєР·Р°РјРµРЅ.РєРѕРЅСЃСѓР»СЊС‚Р°С†С–СЏ', 9: 'РњРљР ',
            12: 'РєСѓСЂСЃРѕРІС– СЂРѕР±РѕС‚Рё', 13: 'Р·Р°Р»С–Рє', 14: 'РµРєР·Р°РјРµРЅ', 16: 'Р†РЅРґ.Р·Р°РЅСЏС‚С‚СЏ'
        };

        for (let i = 0; i < 19; i++) {
            const colLetter = String.fromCharCode(65 + i);
            const cell = sheet.getCell(`${colLetter}${fRow}`);
            cell.border = borderStyle;
            cell.alignment = centerStyle;
            if (i === 18) {
                cell.value = { formula: `SUM(A${fRow}:R${fRow})` };
            } else if (formulaCriteria[i]) {
                const criteria = formulaCriteria[i];
                cell.value = { formula: `SUMIF(O8:Q${dataEndRow},"${criteria}",R8:S${dataEndRow})` };
            }
        }

        const signRow = fRow + 2;
        sheet.getCell(`A${signRow}`).value = '"Р—РђРўР’Р•Р Р”Р–РЈР®"';
        const signRow2 = signRow + 1;
        sheet.getCell(`A${signRow2}`).value = 'Р—Р°РІС–РґСѓРІР°С‡ РєР°С„РµРґСЂРё';
        sheet.getCell(`K${signRow2}`).value = 'РџС–РґРїРёСЃ РІРёРєР»Р°РґР°С‡Р°';

        // --- Detailed Subject Statistics ---
        const detailedStatsStart = signRow2 + 4;
        sheet.getCell(`A${detailedStatsStart}`).value = "РЎС‚Р°С‚РёСЃС‚РёРєР° РїРѕ РїСЂРµРґРјРµС‚Р°С… С‚Р° РіСЂСѓРїР°С…:";
        sheet.getCell(`A${detailedStatsStart}`).font = fontBold;

        const tableHead = detailedStatsStart + 1;
        sheet.getCell(`A${tableHead}`).value = "РџСЂРµРґРјРµС‚";
        sheet.getCell(`D${tableHead}`).value = "Р“СЂСѓРїР°";
        sheet.getCell(`G${tableHead}`).value = "Р›РµРєС†С–С—";
        sheet.getCell(`I${tableHead}`).value = "РџСЂР°РєС‚.";
        sheet.getCell(`K${tableHead}`).value = "Р›Р°Р±.";
        sheet.getCell(`M${tableHead}`).value = "Р’СЃСЊРѕРіРѕ";

        ['A', 'D', 'G', 'I', 'K', 'M'].forEach(c => {
            sheet.getCell(`${c}${tableHead}`).font = fontBold;
            sheet.getCell(`${c}${tableHead}`).border = borderStyle;
        });

        const stats = computeSubjectStats(lessons);
        let statRow = tableHead + 1;

        stats.forEach(item => {
            mergeAndSet(`A${statRow}:C${statRow}`, item.subject, fontNormal, { ...centerStyle, horizontal: 'left' }, true);
            mergeAndSet(`D${statRow}:F${statRow}`, item.group, fontNormal, centerStyle, true);

            ["G", "I", "K", "M"].forEach(c => sheet.getCell(`${c}${statRow}`).border = borderStyle);
            sheet.getCell(`H${statRow}`).border = borderStyle;
            sheet.getCell(`J${statRow}`).border = borderStyle;
            sheet.getCell(`L${statRow}`).border = borderStyle;

            mergeAndSet(`G${statRow}:H${statRow}`, item.lectures, fontNormal, centerStyle, true);
            mergeAndSet(`I${statRow}:J${statRow}`, item.practices, fontNormal, centerStyle, true);
            mergeAndSet(`K${statRow}:L${statRow}`, item.labs, fontNormal, centerStyle, true);

            const total = item.lectures + item.practices + item.labs + item.other;
            sheet.getCell(`M${statRow}`).value = total;
            sheet.getCell(`M${statRow}`).alignment = centerStyle;
            sheet.getCell(`M${statRow}`).border = borderStyle;

            statRow++;
        });
    }

    function computeSubjectStats(lessons) {
        const map = new Map();
        lessons.forEach(l => {
            const group = l.contingent || l.group || 'РќРµ РІРєР°Р·Р°РЅРѕ';
            const subject = l.discipline || 'Р‘РµР· РЅР°Р·РІРё';
            const key = `${subject}||${group}`;
            if (!map.has(key)) map.set(key, { subject, group, lectures: 0, practices: 0, labs: 0, other: 0 });

            const entry = map.get(key);
            const type = (l.study_type || '').toLowerCase();
            const hours = l.study_hours ? Number(l.study_hours) : 2;

            if (type.includes('Р»РµРєС†')) entry.lectures += hours;
            else if (type.includes('РїСЂР°РєС‚')) entry.practices += hours;
            else if (type.includes('Р»Р°Р±')) entry.labs += hours;
            else entry.other += hours;
        });
        return Array.from(map.values()).sort((a, b) => a.subject.localeCompare(b.subject));
    }

    function generateSummarySheet(sheet, lessons, title) {
        sheet.getCell('A1').value = title;
        sheet.getCell('A1').font = { size: 14, bold: true };

        const tableHead = 3;
        const fontBold = { bold: true };
        sheet.columns = [{ width: 30 }, { width: 20 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
        sheet.getRow(tableHead).values = ['РџСЂРµРґРјРµС‚', 'Р“СЂСѓРїР°', 'Р›РµРєС†С–С—', 'РџСЂР°РєС‚РёС‡РЅС–', 'Р›Р°Р±РѕСЂР°С‚РѕСЂРЅС–', 'Р’СЃСЊРѕРіРѕ'];
        sheet.getRow(tableHead).font = fontBold;

        const stats = computeSubjectStats(lessons);
        let r = tableHead + 1;
        stats.forEach(item => {
            const total = item.lectures + item.practices + item.labs + item.other;
            sheet.getRow(r).values = [item.subject, item.group, item.lectures, item.practices, item.labs, total];
            r++;
        });
    }

    // =========================================================
    // ROUTE: Occupancy Cache (/api/occupancy)
    // =========================================================
    if (pathname === '/api/occupancy') {
        const db = await getDb();
        const date = urlObj.searchParams.get('date') || '';

        if (req.method === 'GET') {
            if (!date) {
                res.status(400).json({ error: 'Missing date parameter' });
                return;
            }
            const cacheKey = `occupancy:${date}`;
            let cached = null;

            if (db) {
                try {
                    if (db.type === 'kv') {
                        cached = await db.client.get(cacheKey);
                    } else if (db.type === 'redis') {
                        const str = await db.client.get(cacheKey);
                        try { cached = str ? JSON.parse(str) : null; } catch (e) { }
                    }
                } catch (e) { /* ignore */ }
            }

            res.status(200).json(cached || { cached: false, data: [] });
            return;
        }

        if (req.method === 'POST') {
            const payload = req.body || {};
            const results = payload.results;
            const postDate = payload.date || date;

            if (!postDate || !Array.isArray(results)) {
                res.status(400).json({ error: 'Missing date or invalid results (array expected)' });
                return;
            }

            const cacheKey = `occupancy:${postDate}`;
            const cacheData = { cached: true, timestamp: Date.now(), data: results };

            if (db) {
                try {
                    if (db.type === 'kv') {
                        await db.client.set(cacheKey, cacheData, { ex: 3600 }); // 1 hour TTL
                    } else if (db.type === 'redis') {
                        await db.client.set(cacheKey, JSON.stringify(cacheData), { EX: 3600 });
                    }
                    res.status(200).json({ success: true, cached: true });
                } catch (e) {
                    res.status(500).json({ error: e.message });
                }
            } else {
                res.status(500).json({ error: 'No database available for caching' });
            }
            return;
        }
    }

    // =========================================================
    // ROUTE: PROXY (Osvita) вЂ” with in-memory cache
    // =========================================================

    // Safety check: Don't proxy 'links'
    // Remove trailing slash if present
    const cleanPath = pathname.replace(/\/$/, '');
    const action = cleanPath.split('/').pop();

    if (action.startsWith('links') || action.startsWith('report')) {
        res.status(404).json({ error: 'Endpoint not found' });
        return;
    }

    const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/';
    const search = urlObj.search;
    const targetUrl = `${API_URL}${action}${search}`;

    const cacheKeyNorm = normalizeProxyCacheKey(targetUrl);
    const cached = await getCachedProxy(cacheKeyNorm);
    if (cached) {
        console.log(`[Proxy] CACHE HIT: ${action}`);
        res.status(cached.statusCode);
        res.send(cached.data);
        return;
    }

    if (!enforceRateLimit(req, res, 'proxy', RATE_LIMITS.proxy)) {
        return;
    }

    console.log(`[Proxy] Action: ${action} -> Forwarding to: ${targetUrl}`);
    const isSchedule = action.toLowerCase().startsWith('getscheduledata');

    // #16: node-fetch v2 ignores `timeout` option вЂ” use AbortController
    try {
        const proxyResult = await getOrCreateInFlightProxy(cacheKeyNorm, async () => {
            const proxyController = new AbortController();
            const proxyTimeoutId = setTimeout(() => proxyController.abort(), 10000);
            const apiRes = await fetchImpl(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'http://wp-fuaid.zzz.com.ua/',
                    'Content-Type': 'application/json'
                },
                signal: proxyController.signal
            });
            clearTimeout(proxyTimeoutId);

            const data = await apiRes.text();
            if (apiRes.status === 200 && data.length > 0) {
                await setCachedProxy(cacheKeyNorm, data, apiRes.status, isSchedule);
            }
            return { statusCode: apiRes.status, data };
        });

        res.status(proxyResult.statusCode);
        res.send(proxyResult.data);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy request failed' });
    }
};

apiHandler.__setFetchForTests = (mockFetch) => {
    if (typeof mockFetch === 'function') {
        fetchImpl = mockFetch;
    }
};

apiHandler.__resetInternalsForTests = () => {
    fetchImpl = require('node-fetch');
    rateLimitStore.clear();
    reportJobs.clear();
    proxyCache.clear();
    inFlightProxyRequests.clear();
};

const readFallbackSessionFile = () => {
    try {
        if (!fs.existsSync(SESSION_FALLBACK_FILE)) return null;
        const raw = fs.readFileSync(SESSION_FALLBACK_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.items)) return null;
        return parsed;
    } catch (e) {
        console.error('Fallback session file read error', e);
        return null;
    }
};

const loadSessionData = async () => {
    const db = await getDb();
    if (db) {
        try {
            if (db.type === 'kv') {
                const data = await db.client.get('session_data');
                if (data && Array.isArray(data.items)) return { data, storage: 'kv' };
            } else if (db.type === 'redis') {
                const raw = await db.client.get('session_data');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.items)) return { data: parsed, storage: 'redis' };
                }
            }
        } catch (e) {
            console.error('Session DB read error', e);
        }
    }

    const local = getLocalDb();
    if (local.session_data && Array.isArray(local.session_data.items)) {
        return { data: local.session_data, storage: 'local-db' };
    }

    const fallback = readFallbackSessionFile();
    if (fallback) return { data: fallback, storage: 'file-fallback' };

    return {
        data: {
            sourceFile: '',
            generatedAt: '',
            term: 'Session',
            items: []
        },
        storage: 'empty'
    };
};

const saveSessionData = async (payload) => {
    const db = await getDb();
    if (db) {
        if (db.type === 'kv') {
            await db.client.set('session_data', payload);
            return 'kv';
        }
        if (db.type === 'redis') {
            await db.client.set('session_data', JSON.stringify(payload));
            return 'redis';
        }
    }

    const local = getLocalDb();
    local.session_data = payload;
    if (!saveLocalDb(local)) {
        throw new Error('Failed to write local session data');
    }
    return 'local-db';
};

module.exports = apiHandler;

