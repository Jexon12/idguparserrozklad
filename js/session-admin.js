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
        if (!files.length) return 'Оберіть хоча б один .docx файл';
        if (files.length > MAX_FILES) return `Забагато файлів: максимум ${MAX_FILES} за раз`;
        const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalBytes > MAX_TOTAL_BYTES) {
            return `Занадто великий пакет: максимум ${(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB за раз`;
        }
        return '';
    };

    const extractTeacherNames = (value) => {
        const raw = clean(value).replace(/[\u200e\u200f]/g, '');
        if (!raw) return [];

        const prepared = raw
            // Split glued names like "Є.О.Мізюк" into separate teacher tokens.
            .replace(/([\p{Lu}])\.\s*([\p{Lu}])\.\s*(?=[\p{Lu}][\p{Ll}'’\-]{2,})/gu, '$1.$2.; ')
            .replace(/\s*(,|\/|\|)\s*/g, '; ')
            .replace(/\s+та\s+/giu, '; ')
            .replace(/;\s*;\s*/g, '; ');

        const regex = /([\p{Lu}][\p{Ll}'’\-]+)\s*([\p{Lu}])\.\s*([\p{Lu}])\.?/gu;
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
                .filter((line) => line.includes(':') && !line.toLowerCase().includes('освіт'))
                .join('; ');
            const program = metaLines
                .filter((line) => line.toLowerCase().includes('освіт'))
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
        if (!inTrash) return `${session.term || 'Session'} (${count} записів)`;
        const deletedAt = session.deletedAt ? new Date(session.deletedAt).toLocaleString('uk-UA') : '—';
        return `${session.term || 'Session'} (${count}) · видалено: ${deletedAt}`;
    };

    const renderTerms = () => {
        const sessions = Array.isArray(state.sessions) ? state.sessions : [];
        const trash = Array.isArray(state.trash) ? state.trash : [];

        els.existingTerms.innerHTML = '';
        els.trashTerms.innerHTML = '';

        if (!sessions.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Немає активних сесій';
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
            opt.textContent = 'Корзина порожня';
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

        els.termSummary.textContent = `Активних сесій: ${sessions.length} · Записів: ${totalActiveItems} · storage: ${state.storage}`;
        els.trashSummary.textContent = `У корзині: ${trash.length} сесій · ${totalTrashItems} записів`;
    };

    const renderHistory = () => {
        els.historyList.innerHTML = '';
        const list = Array.isArray(state.history) ? state.history.slice().reverse().slice(0, 80) : [];
        if (!list.length) {
            const li = document.createElement('li');
            li.textContent = 'Історія поки порожня';
            els.historyList.appendChild(li);
            return;
        }

        list.forEach((entry) => {
            const li = document.createElement('li');
            const at = entry.at ? new Date(entry.at).toLocaleString('uk-UA') : '—';
            const action = clean(entry.action || 'action');
            const term = clean(entry.term || '');
            const by = clean(entry.by || 'unknown');
            li.textContent = `${at} · ${action}${term ? ` · ${term}` : ''} · ${by}`;
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
            setStatus('Введіть ADMIN_PASSWORD', true);
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
            setStatus('JSZip не завантажений', true);
            return;
        }

        setStatus('Парсинг файлів...');
        state.filesParsed = files.map((f) => f.name);
        state.items = [];
        setParseProgress(0, files.length, `0/${files.length}`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setParseProgress(i, files.length, `Обробка: ${file.name}`);
            try {
                const rows = await parseDocxFile(file);
                state.items.push(...rows);
                setParseProgress(i + 1, files.length, `Готово: ${i + 1}/${files.length}`);
            } catch (e) {
                setStatus(`Помилка парсингу ${file.name}: ${e.message}`, true);
                return;
            }
        }

        renderSummary();
        setStatus(`Парсинг завершено: ${state.items.length} записів`);
    };

    const uploadData = async () => {
        if (!state.items.length) {
            setStatus('Спочатку розпарсіть файли', true);
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

        setStatus('Завантажую дані в API...');
        try {
            const safe = await apiJson('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            setStatus(`Успішно: додано ${safe.added || 0}, всього ${safe.count || 0} (сесія: ${safe.term || ''}, storage: ${safe.storage || 'n/a'})`);
            await loadStore();
        } catch (e) {
            setStatus(`Помилка завантаження: ${e.message}`, true);
        }
    };

    const exportBackup = async () => {
        try {
            const data = await loadStore();
            exportJsonToFile(data, 'session_backup_all');
            setStatus('JSON backup успішно експортовано');
        } catch (e) {
            setStatus(`Помилка backup: ${e.message}`, true);
        }
    };

    const exportSelectedTerm = async () => {
        const term = clean(els.existingTerms.value || els.term.value);
        if (!term) {
            setStatus('Оберіть сесію для експорту', true);
            return;
        }
        try {
            const data = await loadStore();
            const normalized = normalizeTerm(term);
            const sessions = (data.sessions || []).filter((s) => normalizeTerm(s.term) === normalized);
            if (!sessions.length) {
                setStatus('Сесію для експорту не знайдено', true);
                return;
            }
            exportJsonToFile({ sessions, exportedAt: new Date().toISOString(), term }, 'session_backup_term');
            setStatus(`Експортовано сесію: ${term}`);
        } catch (e) {
            setStatus(`Помилка експорту: ${e.message}`, true);
        }
    };

    const deleteSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.existingTerms.value || els.term.value);
        if (!term) {
            setStatus('Оберіть сесію для видалення', true);
            return;
        }

        if (!window.confirm(`Перемістити сесію "${term}" у корзину?`)) return;

        try {
            // Auto-backup before destructive action
            const snapshot = await loadStore();
            exportJsonToFile(snapshot, `session_backup_before_delete_${term.replace(/\s+/g, '_')}`);

            setStatus(`Переміщую сесію "${term}" у корзину...`);
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
            setStatus(`Сесію переміщено в корзину: ${result.term || term}. Видалено записів: ${result.deletedItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Помилка видалення: ${e.message}`, true);
        }
    };

    const restoreSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.trashTerms.value);
        if (!term) {
            setStatus('Оберіть сесію в корзині для відновлення', true);
            return;
        }

        try {
            setStatus(`Відновлюю сесію "${term}"...`);
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
            setStatus(`Сесію відновлено: ${result.term || term}. Відновлено записів: ${result.restoredItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Помилка відновлення: ${e.message}`, true);
        }
    };

    const purgeSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const term = clean(els.trashTerms.value);
        if (!term) {
            setStatus('Оберіть сесію в корзині', true);
            return;
        }

        if (!window.confirm(`Видалити назавжди "${term}" з корзини?`)) return;

        try {
            setStatus(`Видаляю назавжди "${term}"...`);
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
            setStatus(`Видалено назавжди: ${result.term || term}. Записів: ${result.purgedItems || 0}`);
            await loadStore();
        } catch (e) {
            setStatus(`Помилка очищення корзини: ${e.message}`, true);
        }
    };

    const renameSelectedTerm = async () => {
        const auth = ensureAdminContext();
        if (!auth) return;

        const fromTerm = clean(els.existingTerms.value || els.term.value);
        const toTerm = clean(els.renameTermInput.value);

        if (!fromTerm || !toTerm) {
            setStatus('Оберіть сесію і введіть нову назву', true);
            return;
        }

        if (!window.confirm(`Перейменувати "${fromTerm}" на "${toTerm}"?`)) return;

        try {
            setStatus('Перейменовую сесію...');
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
            setStatus(`Перейменовано: ${result.fromTerm || fromTerm} → ${result.toTerm || toTerm}`);
            els.renameTermInput.value = '';
            await loadStore();
        } catch (e) {
            setStatus(`Помилка перейменування: ${e.message}`, true);
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

    setParseProgress(0, 1, 'Очікування файлів...');
    loadStore().catch((e) => setStatus(`Помилка ініціалізації: ${e.message}`, true));
})();
