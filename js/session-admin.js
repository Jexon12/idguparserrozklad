(function () {
    const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const MAX_FILES = 25;
    const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

    const els = {
        password: document.getElementById('adminPassword'),
        actor: document.getElementById('adminActor'),
        term: document.getElementById('sessionTerm'),
        studyForm: document.getElementById('studyForm'),
        files: document.getElementById('docxFiles'),
        parseBtn: document.getElementById('parseFiles'),
        uploadBtn: document.getElementById('uploadData'),
        exportBackup: document.getElementById('exportBackup'),
        status: document.getElementById('adminStatus'),
        fileCount: document.getElementById('fileCount'),
        itemCount: document.getElementById('itemCount'),
        groupPreview: document.getElementById('groupPreview'),
        parseProgressBar: document.getElementById('parseProgressBar'),
        parseProgressText: document.getElementById('parseProgressText'),
        existingTerms: document.getElementById('existingTerms'),
        refreshTerms: document.getElementById('refreshTerms'),
        deleteTerm: document.getElementById('deleteTerm'),
        renameTerm: document.getElementById('renameTerm'),
        renameTermInput: document.getElementById('renameTermInput'),
        exportSelectedTerm: document.getElementById('exportSelectedTerm'),
        termSummary: document.getElementById('termSummary'),
        trashTerms: document.getElementById('trashTerms'),
        restoreTerm: document.getElementById('restoreTerm'),
        purgeTerm: document.getElementById('purgeTerm'),
        trashSummary: document.getElementById('trashSummary'),
        historyList: document.getElementById('historyList')
    };

    const state = {
        filesParsed: [],
        items: [],
        sessions: [],
        trash: [],
        history: [],
        storage: 'unknown'
    };

    const setStatus = (msg, isError) => {
        els.status.textContent = msg;
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
    };

    const clean = (value) => String(value || '')
        .replace(/[\u200e\u200f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeTerm = (value) => clean(value).toLowerCase();

    const setParseProgress = (current, total, label) => {
        const safeTotal = Math.max(total, 1);
        const pct = Math.round((current / safeTotal) * 100);
        els.parseProgressBar.style.width = `${pct}%`;
        els.parseProgressText.textContent = label || `${current}/${total}`;
    };

    const validateFiles = (files) => {
        if (!files.length) return 'Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋРІР‚В¦Р В РЎвЂўР РЋРІР‚РЋР В Р’В° Р В Р’В± Р В РЎвЂўР В РўвЂР В РЎвЂР В Р вЂ¦ .docx Р РЋРІР‚С›Р В Р’В°Р В РІвЂћвЂ“Р В Р’В»';
        if (files.length > MAX_FILES) return `Р В РІР‚вЂќР В Р’В°Р В Р’В±Р В Р’В°Р В РЎвЂ“Р В Р’В°Р РЋРІР‚С™Р В РЎвЂў Р РЋРІР‚С›Р В Р’В°Р В РІвЂћвЂ“Р В Р’В»Р РЋРІР‚вЂњР В Р вЂ : Р В РЎВР В Р’В°Р В РЎвЂќР РЋР С“Р В РЎвЂР В РЎВР РЋРЎвЂњР В РЎВ ${MAX_FILES} Р В Р’В·Р В Р’В° Р РЋР вЂљР В Р’В°Р В Р’В·`;
        const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalBytes > MAX_TOTAL_BYTES) {
            return `Р В РІР‚вЂќР В Р’В°Р В Р вЂ¦Р В Р’В°Р В РўвЂР РЋРІР‚С™Р В РЎвЂў Р В Р вЂ Р В Р’ВµР В Р’В»Р В РЎвЂР В РЎвЂќР В РЎвЂР В РІвЂћвЂ“ Р В РЎвЂ”Р В Р’В°Р В РЎвЂќР В Р’ВµР РЋРІР‚С™: Р В РЎВР В Р’В°Р В РЎвЂќР РЋР С“Р В РЎвЂР В РЎВР РЋРЎвЂњР В РЎВ ${(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB Р В Р’В·Р В Р’В° Р РЋР вЂљР В Р’В°Р В Р’В·`;
        }
        return '';
    };

    const extractTeacherNames = (value) => {
        const raw = clean(value).replace(/[\u200e\u200f]/g, '');
        if (!raw) return [];

        const prepared = raw
            .replace(
                /([\p{Lu}])\.\s*([\p{Lu}])\.\s*(?=[\p{Lu}][\p{Ll}'вЂ™\-]{2,})/gu,
                '$1.$2.; '
            )
            .replace(/\s*(,|\/|\|)\s*/g, '; ')
            .replace(/\s+\u0442\u0430\s+/giu, '; ')
            .replace(/;\s*;\s*/g, '; ');

        const regex = /([\p{Lu}][\p{Ll}'вЂ™\-]+)\s*([\p{Lu}])\.\s*([\p{Lu}])\.?/gu;
        const names = [];
        let match;
        while ((match = regex.exec(prepared)) !== null) {
            const full = `${match[1]} ${match[2]}.${match[3]}.`;
            if (!names.includes(full)) names.push(full);
        }

        if (names.length) return names;

        return prepared
            .split(';')
            .map((part) => clean(part).replace(/([\p{Lu}])\s*\.\s*([\p{Lu}])\.?/gu, '$1.$2.'))
            .filter(Boolean);
    };

    const normalizeTeacher = (value) => extractTeacherNames(value).join('; ');

    const parseGroups = (heading) => {
        const raw = clean(heading);
        if (!raw) return [];
        const out = [];
        const regex = /(\d{1,3})\s*([\p{L}])?/gu;
        let match;
        while ((match = regex.exec(raw)) !== null) {
            const group = clean(`${match[1]}${match[2] || ''}`.toLowerCase());
            if (group && !out.includes(group)) out.push(group);
        }
        return out;
    };

    const getElementText = (el) => {
        const nodes = el.getElementsByTagNameNS(WORD_NS, 't');
        let text = '';
        for (let i = 0; i < nodes.length; i++) {
            text += nodes[i].textContent || '';
        }
        return clean(text);
    };

    const parseDocxFile = async (file) => {
        const zip = await window.JSZip.loadAsync(file);
        const xmlStr = await zip.file('word/document.xml').async('string');
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlStr, 'application/xml');
        const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
        if (!body) return [];

        const items = [];
        let paragraphBuffer = [];
        let tableIdx = 0;

        for (let i = 0; i < body.childNodes.length; i++) {
            const child = body.childNodes[i];
            if (!child || !child.localName) continue;

            if (child.localName === 'p') {
                const text = getElementText(child);
                if (text) paragraphBuffer.push(text);
                continue;
            }

            if (child.localName !== 'tbl') continue;
            tableIdx += 1;
            const heading = paragraphBuffer[0] || '';
            const metaLines = paragraphBuffer.slice(1);
            paragraphBuffer = [];

            const groups = parseGroups(heading);
            const speciality = metaLines
                .filter((line) => line.includes(':') && !line.toLowerCase().includes('Р В РЎвЂўР РЋР С“Р В Р вЂ Р РЋРІР‚вЂњР РЋРІР‚С™'))
                .join('; ');
            const program = metaLines
                .filter((line) => line.toLowerCase().includes('Р В РЎвЂўР РЋР С“Р В Р вЂ Р РЋРІР‚вЂњР РЋРІР‚С™'))
                .join('; ');

            const rows = child.getElementsByTagNameNS(WORD_NS, 'tr');
            let controlType = '';
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                if (r === 0) continue;
                const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
                if (!cells.length) continue;

                const vals = [];
                for (let c = 0; c < cells.length; c++) {
                    vals.push(getElementText(cells[c]));
                }
                while (vals.length < 7) vals.push('');

                const nonEmpty = vals.filter(Boolean);
                if (nonEmpty.length === 1 && vals[1]) {
                    controlType = vals[1];
                    continue;
                }
                if (!vals[1]) continue;

                items.push({
                    groupHeading: heading,
                    groups,
                    speciality,
                    program,
                    controlType,
                    discipline: vals[1],
                    examForm: vals[2],
                    teacher: normalizeTeacher(vals[3]),
                    date: vals[4],
                    time: vals[5],
                    room: vals[6],
                    sourceTable: tableIdx,
                    sourceFile: file.name
                });
            }
        }

        return items;
    };

    const renderSummary = () => {
        els.fileCount.textContent = String(state.filesParsed.length);
        els.itemCount.textContent = String(state.items.length);
        els.groupPreview.innerHTML = '';
        const groups = Array.from(new Set(
            state.items.flatMap((item) => item.groups || [])
        )).sort((a, b) => a.localeCompare(b, 'uk'));

        groups.slice(0, 60).forEach((group) => {
            const chip = document.createElement('span');
            chip.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800';
            chip.textContent = group;
            els.groupPreview.appendChild(chip);
        });
    };

    const apiJson = async (url, options) => {
        const res = await fetch(url, options);
        const raw = await res.text();
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { }
        if (!res.ok) {
            const serverMsg = (json && (json.error || json.message)) ? (json.error || json.message) : (raw || 'Request failed');
            throw new Error(`HTTP ${res.status}: ${serverMsg}`);
        }
        return json || {};
    };

    const makeTermOptionText = (session, inTrash) => {
        const count = Array.isArray(session.items) ? session.items.length : 0;
        if (!inTrash) return `${session.term || 'Session'} (${count} Р В Р’В·Р В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ )`;
        const deletedAt = session.deletedAt ? new Date(session.deletedAt).toLocaleString('uk-UA') : 'Р Р†Р вЂљРІР‚Сњ';
        return `${session.term || 'Session'} (${count}) Р вЂ™Р’В· Р В Р вЂ Р В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В РЎвЂў: ${deletedAt}`;
    };

    const renderTerms = () => {
        const sessions = Array.isArray(state.sessions) ? state.sessions : [];
        const trash = Array.isArray(state.trash) ? state.trash : [];

        els.existingTerms.innerHTML = '';
        els.trashTerms.innerHTML = '';

        if (!sessions.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Р В РЎСљР В Р’ВµР В РЎВР В Р’В°Р РЋРІР‚Сњ Р В Р’В°Р В РЎвЂќР РЋРІР‚С™Р В РЎвЂР В Р вЂ Р В Р вЂ¦Р В РЎвЂР РЋРІР‚В¦ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР В РІвЂћвЂ“';
            els.existingTerms.appendChild(opt);
        } else {
            sessions
                .slice()
                .sort((a, b) => normalizeTerm(a.term).localeCompare(normalizeTerm(b.term), 'uk'))
                .forEach((session) => {
                    const opt = document.createElement('option');
                    opt.value = session.term || '';
                    opt.textContent = makeTermOptionText(session, false);
                    els.existingTerms.appendChild(opt);
                });
        }

        if (!trash.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Р В РЎв„ўР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р В Р’В° Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР В РЎвЂўР В Р’В¶Р В Р вЂ¦Р РЋР РЏ';
            els.trashTerms.appendChild(opt);
        } else {
            trash
                .slice()
                .sort((a, b) => (Date.parse(b.deletedAt || '') || 0) - (Date.parse(a.deletedAt || '') || 0))
                .forEach((session) => {
                    const opt = document.createElement('option');
                    opt.value = session.term || '';
                    opt.textContent = makeTermOptionText(session, true);
                    els.trashTerms.appendChild(opt);
                });
        }

        const totalActiveItems = sessions.reduce((sum, s) => sum + ((s.items || []).length), 0);
        const totalTrashItems = trash.reduce((sum, s) => sum + ((s.items || []).length), 0);

        els.termSummary.textContent = `Р В РЎвЂ™Р В РЎвЂќР РЋРІР‚С™Р В РЎвЂР В Р вЂ Р В Р вЂ¦Р В РЎвЂР РЋРІР‚В¦ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР В РІвЂћвЂ“: ${sessions.length} Р вЂ™Р’В· Р В РІР‚вЂќР В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ : ${totalActiveItems} Р вЂ™Р’В· storage: ${state.storage}`;
        els.trashSummary.textContent = `Р В Р в‚¬ Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРІР‚вЂњ: ${trash.length} Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР В РІвЂћвЂ“ Р вЂ™Р’В· ${totalTrashItems} Р В Р’В·Р В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ `;
    };

    const renderHistory = () => {
        els.historyList.innerHTML = '';
        const list = Array.isArray(state.history) ? state.history.slice().reverse().slice(0, 80) : [];
        if (!list.length) {
            const li = document.createElement('li');
            li.textContent = 'Р В РІР‚В Р РЋР С“Р РЋРІР‚С™Р В РЎвЂўР РЋР вЂљР РЋРІР‚вЂњР РЋР РЏ Р В РЎвЂ”Р В РЎвЂўР В РЎвЂќР В РЎвЂ Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР В РЎвЂўР В Р’В¶Р В Р вЂ¦Р РЋР РЏ';
            els.historyList.appendChild(li);
            return;
        }

        list.forEach((entry) => {
            const li = document.createElement('li');
            const at = entry.at ? new Date(entry.at).toLocaleString('uk-UA') : 'Р Р†Р вЂљРІР‚Сњ';
            const action = clean(entry.action || 'action');
            const term = clean(entry.term || '');
            const by = clean(entry.by || 'unknown');
            li.textContent = `${at} Р вЂ™Р’В· ${action}${term ? ` Р вЂ™Р’В· ${term}` : ''} Р вЂ™Р’В· ${by}`;
            els.historyList.appendChild(li);
        });
    };

    const loadStore = async () => {
        const data = await apiJson('/api/session');
        state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
        state.trash = Array.isArray(data.trash) ? data.trash : [];
        state.history = Array.isArray(data.history) ? data.history : [];
        state.storage = data.storage || 'unknown';
        renderTerms();
        renderHistory();
        return data;
    };

    const exportJsonToFile = (payload, prefix) => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `${prefix}_${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const ensureAdminContext = () => {
        const password = clean(els.password.value);
        if (!password) {
            setStatus('Р В РІР‚в„ўР В Р вЂ Р В Р’ВµР В РўвЂР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ ADMIN_PASSWORD', true);
            return null;
        }
        const actor = clean(els.actor.value) || 'admin-ui';
        return { password, actor };
    };

    const parseAll = async () => {
        const files = Array.from(els.files.files || []);
        const validationError = validateFiles(files);
        if (validationError) {
            setStatus(validationError, true);
            return;
        }
        if (!window.JSZip) {
            setStatus('JSZip Р В Р вЂ¦Р В Р’Вµ Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’В°Р В Р вЂ¦Р РЋРІР‚С™Р В Р’В°Р В Р’В¶Р В Р’ВµР В Р вЂ¦Р В РЎвЂР В РІвЂћвЂ“', true);
            return;
        }

        setStatus('Р В РЎСџР В Р’В°Р РЋР вЂљР РЋР С“Р В РЎвЂР В Р вЂ¦Р В РЎвЂ“ Р РЋРІР‚С›Р В Р’В°Р В РІвЂћвЂ“Р В Р’В»Р РЋРІР‚вЂњР В Р вЂ ...');
        state.filesParsed = files.map((f) => f.name);
        state.items = [];
        setParseProgress(0, files.length, `0/${files.length}`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setParseProgress(i, files.length, `Р В РЎвЂєР В Р’В±Р РЋР вЂљР В РЎвЂўР В Р’В±Р В РЎвЂќР В Р’В°: ${file.name}`);
            try {
                const rows = await parseDocxFile(file);
                state.items.push(...rows);
                setParseProgress(i + 1, files.length, `Р В РІР‚СљР В РЎвЂўР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В РЎвЂў: ${i + 1}/${files.length}`);
            } catch (e) {
                setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В РЎвЂ”Р В Р’В°Р РЋР вЂљР РЋР С“Р В РЎвЂР В Р вЂ¦Р В РЎвЂ“Р РЋРЎвЂњ ${file.name}: ${e.message}`, true);
                return;
            }
        }

        renderSummary();
        setStatus(`Р В РЎСџР В Р’В°Р РЋР вЂљР РЋР С“Р В РЎвЂР В Р вЂ¦Р В РЎвЂ“ Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’ВµР РЋР вЂљР РЋРІвЂљВ¬Р В Р’ВµР В Р вЂ¦Р В РЎвЂў: ${state.items.length} Р В Р’В·Р В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ `);
    };

    const uploadData = async () => {
        if (!state.items.length) {
            setStatus('Р В Р Р‹Р В РЎвЂ”Р В РЎвЂўР РЋРІР‚РЋР В Р’В°Р РЋРІР‚С™Р В РЎвЂќР РЋРЎвЂњ Р РЋР вЂљР В РЎвЂўР В Р’В·Р В РЎвЂ”Р В Р’В°Р РЋР вЂљР РЋР С“Р РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋРІР‚С›Р В Р’В°Р В РІвЂћвЂ“Р В Р’В»Р В РЎвЂ', true);
            return;
        }

        const auth = ensureAdminContext();
        if (!auth) return;

        const payload = {
            password: auth.password,
            actor: auth.actor,
            data: {
                sourceFile: state.filesParsed.join(', '),
                generatedAt: new Date().toISOString(),
                term: clean(els.term.value) || 'Session',
                studyForm: clean(els.studyForm.value) || '',
                items: state.items.map((item) => ({
                    ...item,
                    studyForm: clean(els.studyForm.value) || item.studyForm || ''
                }))
            }
        };

        setStatus('Р В РІР‚вЂќР В Р’В°Р В Р вЂ Р В Р’В°Р В Р вЂ¦Р РЋРІР‚С™Р В Р’В°Р В Р’В¶Р РЋРЎвЂњР РЋР вЂ№ Р В РўвЂР В Р’В°Р В Р вЂ¦Р РЋРІР‚вЂњ Р В Р вЂ  API...');
        try {
            const safe = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            setStatus(`Р В Р в‚¬Р РЋР С“Р В РЎвЂ”Р РЋРІР‚вЂњР РЋРІвЂљВ¬Р В Р вЂ¦Р В РЎвЂў: Р В РўвЂР В РЎвЂўР В РўвЂР В Р’В°Р В Р вЂ¦Р В РЎвЂў ${safe.added || 0}, Р В Р вЂ Р РЋР С“Р РЋР Р‰Р В РЎвЂўР В РЎвЂ“Р В РЎвЂў ${safe.count || 0} (Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР РЏ: ${safe.term || ''}, storage: ${safe.storage || 'n/a'})`);
            await loadStore();
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’В°Р В Р вЂ¦Р РЋРІР‚С™Р В Р’В°Р В Р’В¶Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ: ${e.message}`, true);
        }
    };

    const exportBackup = async () => {
        try {
            const data = await loadStore();
            exportJsonToFile(data, 'session_backup_all');
            setStatus('JSON backup Р РЋРЎвЂњР РЋР С“Р В РЎвЂ”Р РЋРІР‚вЂњР РЋРІвЂљВ¬Р В Р вЂ¦Р В РЎвЂў Р В Р’ВµР В РЎвЂќР РЋР С“Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В РЎвЂў');
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° backup: ${e.message}`, true);
        }
    };

    const exportSelectedTerm = async () => {
        const term = clean(els.existingTerms.value || els.term.value);
        if (!term) {
            setStatus('Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В РўвЂР В Р’В»Р РЋР РЏ Р В Р’ВµР В РЎвЂќР РЋР С“Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР РЋРІР‚С™Р РЋРЎвЂњ', true);
            return;
        }
        try {
            const data = await loadStore();
            const normalized = normalizeTerm(term);
            const sessions = (data.sessions || []).filter((s) => normalizeTerm(s.term) === normalized);
            if (!sessions.length) {
                setStatus('Р В Р Р‹Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В РўвЂР В Р’В»Р РЋР РЏ Р В Р’ВµР В РЎвЂќР РЋР С“Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР РЋРІР‚С™Р РЋРЎвЂњ Р В Р вЂ¦Р В Р’Вµ Р В Р’В·Р В Р вЂ¦Р В Р’В°Р В РІвЂћвЂ“Р В РўвЂР В Р’ВµР В Р вЂ¦Р В РЎвЂў', true);
                return;
            }
            exportJsonToFile({ sessions, exportedAt: new Date().toISOString(), term }, 'session_backup_term');
            setStatus(`Р В РІР‚СћР В РЎвЂќР РЋР С“Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР РЋРІР‚С™Р В РЎвЂўР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В РЎвЂў Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№: ${term}`);
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В Р’ВµР В РЎвЂќР РЋР С“Р В РЎвЂ”Р В РЎвЂўР РЋР вЂљР РЋРІР‚С™Р РЋРЎвЂњ: ${e.message}`, true);
        }
    };

    const deleteSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.existingTerms.value || els.term.value);
        if (!term) {
            setStatus('Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В РўвЂР В Р’В»Р РЋР РЏ Р В Р вЂ Р В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ', true);
            return;
        }

        if (!window.confirm(`Р В РЎСџР В Р’ВµР РЋР вЂљР В Р’ВµР В РЎВР РЋРІР‚вЂњР РЋР С“Р РЋРІР‚С™Р В РЎвЂР РЋРІР‚С™Р В РЎвЂ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ "${term}" Р РЋРЎвЂњ Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРЎвЂњ?`)) return;

        try {
            // Auto-backup before destructive action
            const snapshot = await loadStore();
            exportJsonToFile(snapshot, `session_backup_before_delete_${term.replace(/\s+/g, '_')}`);

            setStatus(`Р В РЎСџР В Р’ВµР РЋР вЂљР В Р’ВµР В РЎВР РЋРІР‚вЂњР РЋРІР‚В°Р РЋРЎвЂњР РЋР вЂ№ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ "${term}" Р РЋРЎвЂњ Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРЎвЂњ...`);
            const result = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: auth.password,
                    actor: auth.actor,
                    action: 'deleteTerm',
                    term
                })
            });
            setStatus(`Р В Р Р‹Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В РЎвЂ”Р В Р’ВµР РЋР вЂљР В Р’ВµР В РЎВР РЋРІР‚вЂњР РЋРІР‚В°Р В Р’ВµР В Р вЂ¦Р В РЎвЂў Р В Р вЂ  Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРЎвЂњ: ${result.term || term}. Р В РІР‚в„ўР В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В РЎвЂў Р В Р’В·Р В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ : ${result.deletedItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В Р вЂ Р В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ: ${e.message}`, true);
        }
    };

    const restoreSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.trashTerms.value);
        if (!term) {
            setStatus('Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В Р вЂ  Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРІР‚вЂњ Р В РўвЂР В Р’В»Р РЋР РЏ Р В Р вЂ Р РЋРІР‚вЂњР В РўвЂР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ', true);
            return;
        }

        try {
            setStatus(`Р В РІР‚в„ўР РЋРІР‚вЂњР В РўвЂР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р РЋР вЂ№Р РЋР вЂ№ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ "${term}"...`);
            const result = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: auth.password,
                    actor: auth.actor,
                    action: 'restoreTerm',
                    term
                })
            });
            setStatus(`Р В Р Р‹Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В Р вЂ Р РЋРІР‚вЂњР В РўвЂР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В РЎвЂў: ${result.term || term}. Р В РІР‚в„ўР РЋРІР‚вЂњР В РўвЂР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В РЎвЂў Р В Р’В·Р В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ : ${result.restoredItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В Р вЂ Р РЋРІР‚вЂњР В РўвЂР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ: ${e.message}`, true);
        }
    };

    const purgeSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.trashTerms.value);
        if (!term) {
            setStatus('Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р В Р вЂ  Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р РЋРІР‚вЂњ', true);
            return;
        }

        if (!window.confirm(`Р В РІР‚в„ўР В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В РЎвЂР РЋРІР‚С™Р В РЎвЂ Р В Р вЂ¦Р В Р’В°Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’В¶Р В РўвЂР В РЎвЂ "${term}" Р В Р’В· Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р В РЎвЂ?`)) return;

        try {
            setStatus(`Р В РІР‚в„ўР В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р РЋР РЏР РЋР вЂ№ Р В Р вЂ¦Р В Р’В°Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’В¶Р В РўвЂР В РЎвЂ "${term}"...`);
            const result = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: auth.password,
                    actor: auth.actor,
                    action: 'purgeTerm',
                    term
                })
            });
            setStatus(`Р В РІР‚в„ўР В РЎвЂР В РўвЂР В Р’В°Р В Р’В»Р В Р’ВµР В Р вЂ¦Р В РЎвЂў Р В Р вЂ¦Р В Р’В°Р В Р’В·Р В Р’В°Р В Р вЂ Р В Р’В¶Р В РўвЂР В РЎвЂ: ${result.term || term}. Р В РІР‚вЂќР В Р’В°Р В РЎвЂ”Р В РЎвЂР РЋР С“Р РЋРІР‚вЂњР В Р вЂ : ${result.purgedItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В РЎвЂўР РЋРІР‚РЋР В РЎвЂР РЋРІР‚В°Р В Р’ВµР В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ Р В РЎвЂќР В РЎвЂўР РЋР вЂљР В Р’В·Р В РЎвЂР В Р вЂ¦Р В РЎвЂ: ${e.message}`, true);
        }
    };

    const renameSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const fromTerm = clean(els.existingTerms.value || els.term.value);
        const toTerm = clean(els.renameTermInput.value);

        if (!fromTerm || !toTerm) {
            setStatus('Р В РЎвЂєР В Р’В±Р В Р’ВµР РЋР вЂљР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№ Р РЋРІР‚вЂњ Р В Р вЂ Р В Р вЂ Р В Р’ВµР В РўвЂР РЋРІР‚вЂњР РЋРІР‚С™Р РЋР Р‰ Р В Р вЂ¦Р В РЎвЂўР В Р вЂ Р РЋРЎвЂњ Р В Р вЂ¦Р В Р’В°Р В Р’В·Р В Р вЂ Р РЋРЎвЂњ', true);
            return;
        }

        if (!window.confirm(`Р В РЎСџР В Р’ВµР РЋР вЂљР В Р’ВµР В РІвЂћвЂ“Р В РЎВР В Р’ВµР В Р вЂ¦Р РЋРЎвЂњР В Р вЂ Р В Р’В°Р РЋРІР‚С™Р В РЎвЂ "${fromTerm}" Р В Р вЂ¦Р В Р’В° "${toTerm}"?`)) return;

        try {
            setStatus('Р В РЎСџР В Р’ВµР РЋР вЂљР В Р’ВµР В РІвЂћвЂ“Р В РЎВР В Р’ВµР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р РЋРЎвЂњР РЋР вЂ№ Р РЋР С“Р В Р’ВµР РЋР С“Р РЋРІР‚вЂњР РЋР вЂ№...');
            const result = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password: auth.password,
                    actor: auth.actor,
                    action: 'renameTerm',
                    term: fromTerm,
                    toTerm
                })
            });
            setStatus(`Р В РЎСџР В Р’ВµР РЋР вЂљР В Р’ВµР В РІвЂћвЂ“Р В РЎВР В Р’ВµР В Р вЂ¦Р В РЎвЂўР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В РЎвЂў: ${result.fromTerm || fromTerm} Р Р†РІР‚В РІР‚в„ў ${result.toTerm || toTerm}`);
            els.renameTermInput.value = '';
            await loadStore();
        } catch (e) {
            setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р В РЎвЂ”Р В Р’ВµР РЋР вЂљР В Р’ВµР В РІвЂћвЂ“Р В РЎВР В Р’ВµР В Р вЂ¦Р РЋРЎвЂњР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ: ${e.message}`, true);
        }
    };

    els.parseBtn.addEventListener('click', parseAll);
    els.uploadBtn.addEventListener('click', uploadData);
    els.exportBackup.addEventListener('click', exportBackup);
    els.exportSelectedTerm.addEventListener('click', exportSelectedTerm);
    els.refreshTerms.addEventListener('click', loadStore);
    els.deleteTerm.addEventListener('click', deleteSelectedTerm);
    els.restoreTerm.addEventListener('click', restoreSelectedTerm);
    els.purgeTerm.addEventListener('click', purgeSelectedTerm);
    els.renameTerm.addEventListener('click', renameSelectedTerm);

    setParseProgress(0, 1, 'Р В РЎвЂєР РЋРІР‚РЋР РЋРІР‚вЂњР В РЎвЂќР РЋРЎвЂњР В Р вЂ Р В Р’В°Р В Р вЂ¦Р В Р вЂ¦Р РЋР РЏ Р РЋРІР‚С›Р В Р’В°Р В РІвЂћвЂ“Р В Р’В»Р РЋРІР‚вЂњР В Р вЂ ...');
    loadStore().catch((e) => setStatus(`Р В РЎСџР В РЎвЂўР В РЎВР В РЎвЂР В Р’В»Р В РЎвЂќР В Р’В° Р РЋРІР‚вЂњР В Р вЂ¦Р РЋРІР‚вЂњР РЋРІР‚В Р РЋРІР‚вЂњР В Р’В°Р В Р’В»Р РЋРІР‚вЂњР В Р’В·Р В Р’В°Р РЋРІР‚В Р РЋРІР‚вЂњР РЋРІР‚вЂќ: ${e.message}`, true));
})();

