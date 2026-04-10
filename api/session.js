const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, '../db.json');
const SESSION_FALLBACK_FILE = path.join(__dirname, '../data/session-2025-26.json');
const _rawAdmin = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = (_rawAdmin && _rawAdmin !== 'admin123' && _rawAdmin.length >= 8)
    ? _rawAdmin
    : (process.env.NODE_ENV === 'production' ? null : 'admin123');

let kvClient = null;
let redisClient = null;
let redisConnecting = false;

const getDb = async () => {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        if (!kvClient) {
            try { kvClient = require('@vercel/kv').kv; } catch (e) { }
        }
        if (kvClient) return { type: 'kv', client: kvClient };
    }

    if (process.env.REDIS_URL) {
        if (!redisClient && !redisConnecting) {
            redisConnecting = true;
            try {
                const { createClient } = require('redis');
                redisClient = createClient({ url: process.env.REDIS_URL });
                await redisClient.connect();
            } catch (e) {
                redisClient = null;
            } finally {
                redisConnecting = false;
            }
        }
        if (redisClient && redisClient.isOpen) return { type: 'redis', client: redisClient };
    }

    return null;
};

const getLocalDb = () => {
    try {
        if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { }
    return {};
};

const saveLocalDb = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        return false;
    }
};

const normalizeSessionTerm = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const readFallbackSessionFile = () => {
    try {
        if (!fs.existsSync(SESSION_FALLBACK_FILE)) return null;
        const parsed = JSON.parse(fs.readFileSync(SESSION_FALLBACK_FILE, 'utf8'));
        if (!parsed || !Array.isArray(parsed.items)) return null;
        return parsed;
    } catch (e) {
        return null;
    }
};

const ensureSessionStore = (input) => {
    if (input && Array.isArray(input.sessions)) {
        const sessions = input.sessions.map((s) => ({
            term: s.term || 'Session',
            generatedAt: s.generatedAt || '',
            sourceFile: s.sourceFile || '',
            items: Array.isArray(s.items) ? s.items : []
        }));
        const items = sessions.flatMap((s) => s.items.map((it) => ({
            ...it,
            term: it.term || s.term || 'Session',
            studyForm: it.studyForm || ''
        })));
        return { updatedAt: input.updatedAt || '', sourceFile: input.sourceFile || '', sessions, items };
    }

    if (input && Array.isArray(input.items)) {
        const term = input.term || 'Session';
        const mappedItems = input.items.map((it) => ({
            ...it,
            term: it.term || term,
            studyForm: it.studyForm || input.studyForm || ''
        }));
        return {
            updatedAt: input.generatedAt || '',
            sourceFile: input.sourceFile || '',
            sessions: [{ term, generatedAt: input.generatedAt || '', sourceFile: input.sourceFile || '', items: mappedItems }],
            items: mappedItems
        };
    }

    return { updatedAt: '', sourceFile: '', sessions: [], items: [] };
};

const loadSessionData = async () => {
    const db = await getDb();
    if (db) {
        try {
            if (db.type === 'kv') {
                const data = await db.client.get('session_data');
                if (data) return { data: ensureSessionStore(data), storage: 'kv' };
            } else if (db.type === 'redis') {
                const raw = await db.client.get('session_data');
                if (raw) return { data: ensureSessionStore(JSON.parse(raw)), storage: 'redis' };
            }
        } catch (e) { }
    }

    const local = getLocalDb();
    if (local.session_data) return { data: ensureSessionStore(local.session_data), storage: 'local-db' };

    const fallback = readFallbackSessionFile();
    if (fallback) return { data: ensureSessionStore(fallback), storage: 'file-fallback' };

    return { data: ensureSessionStore(null), storage: 'empty' };
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
    if (!saveLocalDb(local)) throw new Error('Failed to write local session data');
    return 'local-db';
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method === 'GET') {
        const loaded = await loadSessionData();
        res.status(200).json({ ...loaded.data, storage: loaded.storage });
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    if (!ADMIN_PASSWORD) {
        res.status(503).json({ error: 'Admin panel disabled: set ADMIN_PASSWORD in production' });
        return;
    }

    const dbForSession = await getDb();
    if (!dbForSession && process.env.NODE_ENV === 'production') {
        res.status(503).json({ error: 'Session storage requires REDIS_URL or Vercel KV in production' });
        return;
    }

    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { payload = null; }
    }
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

    const loaded = await loadSessionData();
    const store = ensureSessionStore(loaded.data);
    const term = data.term || 'Session';
    const studyForm = data.studyForm || '';
    const normalizedTerm = normalizeSessionTerm(term);

    const incomingItems = (data.items || []).map((item) => ({
        ...item,
        term: item.term || term,
        studyForm: item.studyForm || studyForm
    }));

    let session = store.sessions.find((s) => normalizeSessionTerm(s.term) === normalizedTerm);
    if (!session) {
        session = {
            term,
            generatedAt: data.generatedAt || new Date().toISOString(),
            sourceFile: data.sourceFile || '',
            items: []
        };
        store.sessions.push(session);
    }

    const makeKey = (item) => [
        item.term || '',
        item.studyForm || '',
        item.groupHeading || '',
        JSON.stringify(item.groups || []),
        item.controlType || '',
        item.discipline || '',
        item.examForm || '',
        item.teacher || '',
        item.date || '',
        item.time || '',
        item.room || ''
    ].join('||');

    const existingKeys = new Set((session.items || []).map(makeKey));
    let added = 0;
    incomingItems.forEach((item) => {
        const key = makeKey(item);
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        session.items.push(item);
        added += 1;
    });

    const sourceSet = new Set(String(session.sourceFile || '').split(',').map((s) => s.trim()).filter(Boolean));
    String(data.sourceFile || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => sourceSet.add(s));
    session.sourceFile = Array.from(sourceSet).join(', ');
    session.generatedAt = new Date().toISOString();

    const storedPayload = {
        updatedAt: new Date().toISOString(),
        sourceFile: session.sourceFile,
        sessions: store.sessions
    };

    const storage = await saveSessionData(storedPayload);
    const total = store.sessions.reduce((sum, s) => sum + ((s.items || []).length), 0);
    res.status(200).json({ success: true, storage, added, count: total, term });
};
