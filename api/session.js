const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, '../db.json');
const SESSION_FALLBACK_FILE = path.join(__dirname, '../data/session-2025-26.json');
const _rawAdmin = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = (_rawAdmin && _rawAdmin !== 'admin123' && _rawAdmin.length >= 8)
    ? _rawAdmin
    : (process.env.NODE_ENV === 'production' ? null : 'admin123');

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ITEMS = 300;
const MAX_BACKUPS = 20;

let kvClient = null;
let redisClient = null;
let redisConnecting = false;

const normalizeSessionTerm = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const nowIso = () => new Date().toISOString();

const getClientIp = (req) => {
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    if (xff) return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
};

const makeItemKey = (item) => [
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

const normalizeSession = (s) => ({
    term: s?.term || 'Session',
    generatedAt: s?.generatedAt || '',
    sourceFile: s?.sourceFile || '',
    items: Array.isArray(s?.items) ? s.items : []
});

const ensureStoreShape = (input) => {
    if (input && Array.isArray(input.sessions)) {
        const sessions = input.sessions.map(normalizeSession);
        const trash = Array.isArray(input.trash)
            ? input.trash.map((s) => ({
                ...normalizeSession(s),
                deletedAt: s.deletedAt || '',
                deletedBy: s.deletedBy || ''
            }))
            : [];
        const history = Array.isArray(input.history)
            ? input.history.map((h) => ({
                at: h.at || '',
                action: h.action || '',
                term: h.term || '',
                by: h.by || '',
                meta: h.meta || {}
            }))
            : [];
        const backups = Array.isArray(input.backups)
            ? input.backups.map((b) => ({
                id: b.id || '',
                at: b.at || '',
                reason: b.reason || '',
                by: b.by || '',
                sourceFile: b.sourceFile || '',
                sessions: Array.isArray(b.sessions) ? b.sessions.map(normalizeSession) : []
            }))
            : [];

        const items = sessions.flatMap((s) => (s.items || []).map((it) => ({
            ...it,
            term: it.term || s.term || 'Session',
            studyForm: it.studyForm || ''
        })));

        return {
            updatedAt: input.updatedAt || '',
            sourceFile: input.sourceFile || '',
            sessions,
            trash,
            history: history.slice(-MAX_HISTORY_ITEMS),
            backups: backups.slice(-MAX_BACKUPS),
            items
        };
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
            trash: [],
            history: [],
            backups: [],
            items: mappedItems
        };
    }

    return {
        updatedAt: '',
        sourceFile: '',
        sessions: [],
        trash: [],
        history: [],
        backups: [],
        items: []
    };
};

const rebuildComputed = (store) => {
    const sessions = store.sessions.map(normalizeSession);
    const items = sessions.flatMap((s) => (s.items || []).map((it) => ({
        ...it,
        term: it.term || s.term || 'Session',
        studyForm: it.studyForm || ''
    })));
    const sourceFiles = sessions.map((s) => s.sourceFile || '').filter(Boolean);

    return {
        ...store,
        sessions,
        sourceFile: sourceFiles.join(', '),
        items
    };
};

const purgeExpiredTrash = (store) => {
    const threshold = Date.now() - TRASH_RETENTION_MS;
    const before = store.trash.length;
    store.trash = (store.trash || []).filter((entry) => {
        const ts = Date.parse(entry.deletedAt || '');
        if (!ts) return true;
        return ts >= threshold;
    });
    return before - store.trash.length;
};

const addHistory = (store, action, term, by, meta) => {
    store.history = store.history || [];
    store.history.push({ at: nowIso(), action, term: term || '', by: by || '', meta: meta || {} });
    if (store.history.length > MAX_HISTORY_ITEMS) {
        store.history = store.history.slice(-MAX_HISTORY_ITEMS);
    }
};

const addBackup = (store, reason, by) => {
    store.backups = store.backups || [];
    store.backups.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        at: nowIso(),
        reason,
        by: by || '',
        sourceFile: store.sourceFile || '',
        sessions: (store.sessions || []).map(normalizeSession)
    });
    if (store.backups.length > MAX_BACKUPS) {
        store.backups = store.backups.slice(-MAX_BACKUPS);
    }
};

const mergeSessionItems = (targetSession, incomingItems) => {
    const existingKeys = new Set((targetSession.items || []).map(makeItemKey));
    let added = 0;

    incomingItems.forEach((item) => {
        const key = makeItemKey(item);
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        targetSession.items.push(item);
        added += 1;
    });

    return added;
};

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

const loadSessionData = async () => {
    const db = await getDb();
    if (db) {
        try {
            if (db.type === 'kv') {
                const data = await db.client.get('session_data');
                if (data) return { data: ensureStoreShape(data), storage: 'kv' };
            } else if (db.type === 'redis') {
                const raw = await db.client.get('session_data');
                if (raw) return { data: ensureStoreShape(JSON.parse(raw)), storage: 'redis' };
            }
        } catch (e) { }
    }

    const local = getLocalDb();
    if (local.session_data) return { data: ensureStoreShape(local.session_data), storage: 'local-db' };

    const fallback = readFallbackSessionFile();
    if (fallback) return { data: ensureStoreShape(fallback), storage: 'file-fallback' };

    return { data: ensureStoreShape(null), storage: 'empty' };
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

const buildResponse = (store, storage, extra) => ({
    ...store,
    storage,
    ...(extra || {})
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method === 'GET') {
        const loaded = await loadSessionData();
        const store = rebuildComputed(ensureStoreShape(loaded.data));
        res.status(200).json(buildResponse(store, loaded.storage));
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

    const { password, data, action, term: actionTerm, toTerm, actor } = payload;
    if (password !== ADMIN_PASSWORD) {
        res.status(403).json({ error: 'Wrong password' });
        return;
    }

    const loaded = await loadSessionData();
    const store = rebuildComputed(ensureStoreShape(loaded.data));
    const by = cleanActor(actor, req);

    purgeExpiredTrash(store);

    if (action === 'deleteTerm' || action === 'softDeleteTerm') {
        const termToDelete = String(actionTerm || '').trim();
        if (!termToDelete) {
            res.status(400).json({ error: 'Missing term for deleteTerm action' });
            return;
        }

        const normalized = normalizeSessionTerm(termToDelete);
        const kept = [];
        const toTrash = [];
        let deletedItems = 0;

        store.sessions.forEach((session) => {
            if (normalizeSessionTerm(session.term) === normalized) {
                const itemCount = (session.items || []).length;
                deletedItems += itemCount;
                toTrash.push({
                    ...normalizeSession(session),
                    deletedAt: nowIso(),
                    deletedBy: by
                });
            } else {
                kept.push(session);
            }
        });

        if (!toTrash.length) {
            res.status(404).json({ error: 'Session term not found' });
            return;
        }

        addBackup(store, `before_delete:${termToDelete}`, by);
        store.sessions = kept;
        store.trash = [...(store.trash || []), ...toTrash];
        addHistory(store, 'deleteTerm', termToDelete, by, { deletedSessions: toTrash.length, deletedItems });

        const next = rebuildComputed(store);
        next.updatedAt = nowIso();
        const storage = await saveSessionData(next);

        res.status(200).json(buildResponse(next, storage, {
            success: true,
            action: 'deleteTerm',
            term: termToDelete,
            deletedSessions: toTrash.length,
            deletedItems,
            count: next.items.length
        }));
        return;
    }

    if (action === 'restoreTerm') {
        const termToRestore = String(actionTerm || '').trim();
        if (!termToRestore) {
            res.status(400).json({ error: 'Missing term for restoreTerm action' });
            return;
        }

        const normalized = normalizeSessionTerm(termToRestore);
        const keepTrash = [];
        const restoreCandidates = [];

        (store.trash || []).forEach((entry) => {
            if (normalizeSessionTerm(entry.term) === normalized) restoreCandidates.push(entry);
            else keepTrash.push(entry);
        });

        if (!restoreCandidates.length) {
            res.status(404).json({ error: 'Session term not found in trash' });
            return;
        }

        let restoredItems = 0;
        restoreCandidates.forEach((entry) => {
            const sessionTermNorm = normalizeSessionTerm(entry.term);
            let target = store.sessions.find((s) => normalizeSessionTerm(s.term) === sessionTermNorm);
            if (!target) {
                target = normalizeSession(entry);
                target.items = [];
                store.sessions.push(target);
            }
            restoredItems += mergeSessionItems(target, (entry.items || []).map((item) => ({
                ...item,
                term: item.term || entry.term
            })));
            target.generatedAt = nowIso();
        });

        store.trash = keepTrash;
        addHistory(store, 'restoreTerm', termToRestore, by, { restoredSessions: restoreCandidates.length, restoredItems });

        const next = rebuildComputed(store);
        next.updatedAt = nowIso();
        const storage = await saveSessionData(next);

        res.status(200).json(buildResponse(next, storage, {
            success: true,
            action: 'restoreTerm',
            term: termToRestore,
            restoredSessions: restoreCandidates.length,
            restoredItems,
            count: next.items.length
        }));
        return;
    }

    if (action === 'purgeTerm') {
        const termToPurge = String(actionTerm || '').trim();
        if (!termToPurge) {
            res.status(400).json({ error: 'Missing term for purgeTerm action' });
            return;
        }

        const normalized = normalizeSessionTerm(termToPurge);
        const before = store.trash.length;
        let purgedItems = 0;
        store.trash = (store.trash || []).filter((entry) => {
            if (normalizeSessionTerm(entry.term) !== normalized) return true;
            purgedItems += (entry.items || []).length;
            return false;
        });

        const purgedSessions = before - store.trash.length;
        if (!purgedSessions) {
            res.status(404).json({ error: 'Session term not found in trash' });
            return;
        }

        addHistory(store, 'purgeTerm', termToPurge, by, { purgedSessions, purgedItems });

        const next = rebuildComputed(store);
        next.updatedAt = nowIso();
        const storage = await saveSessionData(next);

        res.status(200).json(buildResponse(next, storage, {
            success: true,
            action: 'purgeTerm',
            term: termToPurge,
            purgedSessions,
            purgedItems,
            count: next.items.length
        }));
        return;
    }

    if (action === 'renameTerm') {
        const from = String(actionTerm || '').trim();
        const to = String(toTerm || '').trim();
        if (!from || !to) {
            res.status(400).json({ error: 'Missing term/toTerm for renameTerm action' });
            return;
        }
        if (normalizeSessionTerm(from) === normalizeSessionTerm(to)) {
            res.status(400).json({ error: 'New term must be different' });
            return;
        }

        let renamed = 0;

        const renameSession = (session) => {
            if (normalizeSessionTerm(session.term) !== normalizeSessionTerm(from)) return false;
            session.term = to;
            session.generatedAt = nowIso();
            session.items = (session.items || []).map((item) => ({ ...item, term: to }));
            return true;
        };

        store.sessions.forEach((s) => { if (renameSession(s)) renamed += 1; });
        (store.trash || []).forEach((s) => { if (renameSession(s)) renamed += 1; });

        if (!renamed) {
            res.status(404).json({ error: 'Session term not found' });
            return;
        }

        addHistory(store, 'renameTerm', from, by, { toTerm: to, affectedSessions: renamed });

        const next = rebuildComputed(store);
        next.updatedAt = nowIso();
        const storage = await saveSessionData(next);

        res.status(200).json(buildResponse(next, storage, {
            success: true,
            action: 'renameTerm',
            fromTerm: from,
            toTerm: to,
            affectedSessions: renamed,
            count: next.items.length
        }));
        return;
    }

    if (!data || !Array.isArray(data.items)) {
        res.status(400).json({ error: 'Invalid session payload (items[])' });
        return;
    }

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
            generatedAt: data.generatedAt || nowIso(),
            sourceFile: data.sourceFile || '',
            items: []
        };
        store.sessions.push(session);
    }

    const added = mergeSessionItems(session, incomingItems);

    const sourceSet = new Set(String(session.sourceFile || '').split(',').map((s) => s.trim()).filter(Boolean));
    String(data.sourceFile || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => sourceSet.add(s));
    session.sourceFile = Array.from(sourceSet).join(', ');
    session.generatedAt = nowIso();

    addHistory(store, 'uploadItems', term, by, {
        added,
        received: incomingItems.length,
        sourceFile: data.sourceFile || ''
    });

    const next = rebuildComputed(store);
    next.updatedAt = nowIso();
    const storage = await saveSessionData(next);

    res.status(200).json(buildResponse(next, storage, {
        success: true,
        action: 'uploadItems',
        added,
        count: next.items.length,
        term
    }));
};

function cleanActor(actor, req) {
    const value = String(actor || '').trim();
    if (value) return value.slice(0, 120);
    return getClientIp(req);
}
