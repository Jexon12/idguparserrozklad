const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const DB_FILE = path.join(__dirname, '../db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// --- In-memory proxy cache ---
const proxyCache = new Map();
const CACHE_TTL = {
    default: 5 * 60 * 1000,    // 5 minutes for filters, groups, teachers
    schedule: 3 * 60 * 1000    // 3 minutes for schedule data
};
const MAX_CACHE_SIZE = 500; // Max entries to prevent memory leak

function getCachedProxy(url) {
    const entry = proxyCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
        proxyCache.delete(url);
        return null;
    }
    return entry;
}

function setCachedProxy(url, data, statusCode, isSchedule) {
    // Evict oldest entries if too many
    if (proxyCache.size >= MAX_CACHE_SIZE) {
        const firstKey = proxyCache.keys().next().value;
        proxyCache.delete(firstKey);
    }
    proxyCache.set(url, {
        data,
        statusCode,
        timestamp: Date.now(),
        ttl: isSchedule ? CACHE_TTL.schedule : CACHE_TTL.default
    });
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
    // Helper to allow CORS — restrict for admin mutations
    const origin = req.headers.origin || '';
    const isAdminPost = req.method === 'POST' && (req.url.includes('/times') || req.url.includes('/links'));

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

    // ROUTE: Health Check
    // =========================================================
    if (pathname.includes('/health')) {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        return;
    }

    // =========================================================
    // ROUTE: Global Times (/api/times)
    // =========================================================
    if (pathname.includes('/times')) {
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
            console.log("API Times POST received");
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
    // ROUTE: Search (/api/search?q=...)
    // =========================================================
    if (pathname.includes('/search') && req.method === 'GET') {
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
            // No cache — return empty, client handles client-side search
            res.status(200).json([]);
        }
        return;
    }

    // =========================================================
    // ROUTE: Excel Report (/api/report/download)
    // =========================================================
    if (pathname.includes('/report/download') && req.method === 'GET') {
        try {
            const facultyName = urlObj.searchParams.get('faculty') || 'Факультет';
            const departmentName = urlObj.searchParams.get('department') || 'Кафедра';
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

            let currentDt = getMonthDate(monthStartStr);
            const endDt = getMonthDate(monthEndStr);
            const loopEnd = new Date(endDt.getFullYear(), endDt.getMonth() + 1, 0);

            const allSemLessons = [];

            // Loop through months
            while (currentDt <= loopEnd) {
                const year = currentDt.getFullYear();
                const month = currentDt.getMonth(); // 0-11
                const sheetName = currentDt.toLocaleString('uk-UA', { month: 'long', year: 'numeric' });

                // Fetch Data for this month
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

                const API_URL = 'http://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataEmp';
                const param = (val) => `"${val}"`;
                const apiUrlWithParams = `${API_URL}?aVuzID=${11927}&aEmployeeID=${param(teacherId)}&aStartDate=${param(apiStartDate)}&aEndDate=${param(apiEndDate)}&aStudyTypeID=&aGiveStudyTimes=true`;

                console.log(`[Report] Fetching schedule for ${sheetName}: ${apiUrlWithParams}`);
                const apiRes = await fetch(apiUrlWithParams);
                if (!apiRes.ok) throw new Error(`Failed to fetch: ${apiRes.status}`);

                const rawData = await apiRes.json();
                const lessons = Array.isArray(rawData.d) ? rawData.d : (Array.isArray(rawData) ? rawData : []);

                lessons.forEach(l => allSemLessons.push({ ...l, monthObj: new Date(year, month, 1) }));

                // --- Generate Sheet for Month ---
                const sheet = workbook.addWorksheet(sheetName);
                generateMonthSheet(sheet, lessons, { facultyName, departmentName, teacherName, year, month });

                // Next month
                currentDt.setMonth(currentDt.getMonth() + 1);
            }

            // --- Generate Semester Summaries ---
            const sem1Lessons = allSemLessons.filter(l => {
                const m = l.monthObj.getMonth();
                return (m >= 8 && m <= 11) || m === 0; // Sept(8) - Jan(0)
            });
            const sem2Lessons = allSemLessons.filter(l => {
                const m = l.monthObj.getMonth();
                return m >= 1 && m <= 6; // Feb(1) - July(6)
            });

            if (sem1Lessons.length > 0) {
                const semSheet = workbook.addWorksheet('Зведені дані (1 сем)');
                generateSummarySheet(semSheet, sem1Lessons, '1 семестр (Зведені дані)');
            }
            if (sem2Lessons.length > 0) {
                const semSheet = workbook.addWorksheet('Зведені дані (2 сем)');
                generateSummarySheet(semSheet, sem2Lessons, '2 семестр (Зведені дані)');
            }

            // --- Send Response ---
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            const safeName = encodeURIComponent(`Звіт_${teacherName}_${monthStartStr}_${monthEndStr}.xlsx`);
            res.setHeader('Content-Disposition', `attachment; filename="Report.xlsx"; filename*=UTF-8''${safeName}`);
            await workbook.xlsx.write(res);
            res.end();

        } catch (e) {
            console.error("Report Generation Error:", e);
            res.status(500).json({ error: e.message });
        }
        return;
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
        mergeAndSet('A1:S2', 'КАРТКА', { name: 'Arial', size: 12, bold: true }, centerStyle, false);

        mergeAndSet('A3:H3', 'обліку роботи викладача кафедри', fontNormal, { vertical: 'middle', horizontal: 'right' }, false);
        mergeAndSet('I3:S3', departmentName, { ...fontNormal, italic: true }, { vertical: 'middle', horizontal: 'center', wrapText: true }, false);
        sheet.getCell('I3').border = { bottom: { style: 'thin' } };

        mergeAndSet('A4:D4', 'факультету', fontNormal, { vertical: 'middle', horizontal: 'right' }, false);
        mergeAndSet('E4:M4', facultyName, { ...fontNormal, italic: true }, { vertical: 'middle', horizontal: 'center', wrapText: true }, false);
        sheet.getCell('E4').border = { bottom: { style: 'thin' } };

        mergeAndSet('N4:O4', 'ІДГУ ', fontBold, centerStyle, false);

        const monthNames = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
        const monthText = `${monthNames[month]} ${year}р.`;
        mergeAndSet('P4:S4', monthText, fontNormal, centerStyle, false);
        sheet.getCell('P4').border = { bottom: { style: 'thin' } };

        mergeAndSet('A5:S5', teacherName, { ...fontBold, size: 12, underline: true }, centerStyle, false);

        mergeAndSet('A7:C7', 'Дата', fontBold, centerStyle, true);
        mergeAndSet('D7:N7', 'Назва дисципліни або іншого освітнього компоненту', fontBold, centerStyle, true);
        mergeAndSet('O7:Q7', 'Види робіт', fontBold, centerStyle, true);
        mergeAndSet('R7:S7', 'Кількість годин', fontBold, centerStyle, true);

        // T Header
        const tCell = sheet.getCell('T7');
        tCell.value = 'Групи';
        tCell.font = fontBold;
        tCell.alignment = centerStyle;
        tCell.border = borderStyle;

        // Data Filling
        let currentRow = 8;
        const normalizeType = (t) => {
            const s = (t || '').toLowerCase();
            if (s.includes('лекц')) return 'Лекції';
            if (s.includes('лаб')) return 'Лабораторні';
            if (s.includes('практ')) return 'Практичні';
            if (s.includes('консульт') && s.includes('екзам')) return 'екзамен.консультація';
            if (s.includes('консульт')) return 'Проведення консультацій з дисциплін протягом семестру';
            if (s.includes('екзам')) return 'екзамен';
            if (s.includes('залік')) return 'залік';
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

        mergeAndSet(`A${titleRow}:S${titleRow}`, 'Виконання навчального навантаження в годинах по видах робіт', fontNormal, centerStyle, true);

        const hRow = titleRow + 1;
        const statHeaders = [
            'Читання лекцій', 'Прведення практ.занять', 'Проведення лабор.робіт', 'Прведення семінар.занять',
            'Проведення консультацій з дисциплін протягом семестру', 'Керівництво практикою', 'Консультація до екзаменів(аудиторні)',
            'Проведення екзаменаційних консультацій', 'Перевірка контрольних(модульних) робіт', 'Проміжний (модульний) контроль',
            'рефератів, аналітичних оглядів, перекладів', 'графічних та розрахунково-графічних робіт', 'курсовихробіт(проектів)',
            'Проведення заліку', 'Проведення семестрових екзаменів', 'Підсумкова атестація(екзамен)', 'Індивідуальні заняття',
            'Керіництво аспірантами', 'Усього'
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
            0: 'Лекції', 1: 'Практичні', 2: 'Лабораторні', 3: 'сем.работа',
            5: 'практика', 7: 'екзамен.консультація', 9: 'МКР',
            12: 'курсові роботи', 13: 'залік', 14: 'екзамен', 16: 'Інд.заняття'
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
        sheet.getCell(`A${signRow}`).value = '"ЗАТВЕРДЖУЮ"';
        const signRow2 = signRow + 1;
        sheet.getCell(`A${signRow2}`).value = 'Завідувач кафедри';
        sheet.getCell(`K${signRow2}`).value = 'Підпис викладача';

        // --- Detailed Subject Statistics ---
        const detailedStatsStart = signRow2 + 4;
        sheet.getCell(`A${detailedStatsStart}`).value = "Статистика по предметах та групах:";
        sheet.getCell(`A${detailedStatsStart}`).font = fontBold;

        const tableHead = detailedStatsStart + 1;
        sheet.getCell(`A${tableHead}`).value = "Предмет";
        sheet.getCell(`D${tableHead}`).value = "Група";
        sheet.getCell(`G${tableHead}`).value = "Лекції";
        sheet.getCell(`I${tableHead}`).value = "Практ.";
        sheet.getCell(`K${tableHead}`).value = "Лаб.";
        sheet.getCell(`M${tableHead}`).value = "Всього";

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
            const group = l.contingent || l.group || 'Не вказано';
            const subject = l.discipline || 'Без назви';
            const key = `${subject}||${group}`;
            if (!map.has(key)) map.set(key, { subject, group, lectures: 0, practices: 0, labs: 0, other: 0 });

            const entry = map.get(key);
            const type = (l.study_type || '').toLowerCase();
            const hours = l.study_hours ? Number(l.study_hours) : 2;

            if (type.includes('лекц')) entry.lectures += hours;
            else if (type.includes('практ')) entry.practices += hours;
            else if (type.includes('лаб')) entry.labs += hours;
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
        sheet.getRow(tableHead).values = ['Предмет', 'Група', 'Лекції', 'Практичні', 'Лабораторні', 'Всього'];
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
    if (pathname.includes('/occupancy')) {
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

            if (!postDate || !results) {
                res.status(400).json({ error: 'Missing date or results' });
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
    // ROUTE: PROXY (Osvita) — with in-memory cache
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

    // Check proxy cache first (normalize key to ignore cache-buster params)
    const cacheKey = normalizeProxyCacheKey(targetUrl);
    const cached = getCachedProxy(cacheKey);
    if (cached) {
        console.log(`[Proxy] CACHE HIT: ${action}`);
        res.status(cached.statusCode);
        res.send(cached.data);
        return;
    }

    console.log(`[Proxy] Action: ${action} -> Forwarding to: ${targetUrl}`);
    const isSchedule = action.toLowerCase().startsWith('getscheduledata');

    try {
        const apiRes = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'http://wp-fuaid.zzz.com.ua/',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const data = await apiRes.text();

        // Cache successful responses
        if (apiRes.status === 200 && data.length > 0) {
            setCachedProxy(cacheKey, data, apiRes.status, isSchedule);
        }

        res.status(apiRes.status);
        res.send(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Proxy request failed' });
    }
};
