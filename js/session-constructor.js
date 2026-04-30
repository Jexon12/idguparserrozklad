/* Session Constructor based on stable DOCX template */
(function () {
    const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const API_SESSION = '/api/session';
    const MAX_FILES = 30;
    const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

    const els = {
        adminPassword: document.getElementById('adminPassword'),
        adminActor: document.getElementById('adminActor'),
        sessionTerm: document.getElementById('sessionTerm'),
        studyForm: document.getElementById('studyForm'),
        docxFiles: document.getElementById('docxFiles'),
        parseBtn: document.getElementById('parseBtn'),
        normalizeBtn: document.getElementById('normalizeBtn'),
        addRowBtn: document.getElementById('addRowBtn'),
        uploadBtn: document.getElementById('uploadBtn'),
        excelBtn: document.getElementById('excelBtn'),
        copyBtn: document.getElementById('copyBtn'),
        searchInput: document.getElementById('searchInput'),
        groupFilter: document.getElementById('groupFilter'),
        teacherFilter: document.getElementById('teacherFilter'),
        countLabel: document.getElementById('countLabel'),
        progressBar: document.getElementById('progressBar'),
        progressText: document.getElementById('progressText'),
        status: document.getElementById('status'),
        errorBox: document.getElementById('errorBox'),
        tableBody: document.getElementById('tableBody')
    };

    const state = {
        sourceFiles: [],
        rows: [],
        filteredRows: []
    };

    function clean(v) {
        return String(v || '')
            .replace(/[\u200e\u200f]/g, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeDiscipline(v) {
        return clean(v).replace(/^[\d\.\-\)\(]+\s*/g, '').replace(/[;:,]+$/g, '').trim();
    }

    function parseGroups(heading) {
        const out = [];
        const regex = /(\d{1,3})\s*([\p{L}])?/gu;
        let match;
        while ((match = regex.exec(clean(heading))) !== null) {
            const g = clean(`${match[1]}${match[2] || ''}`.toLowerCase());
            if (g && !out.includes(g)) out.push(g);
        }
        return out;
    }

    function splitTeachers(value) {
        const raw = clean(value);
        if (!raw) return [];
        const prepared = raw
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
    }

    function setStatus(msg, isError) {
        els.status.textContent = msg || '';
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
    }

    function showError(message) {
        if (!message) {
            els.errorBox.classList.add('hidden');
            els.errorBox.textContent = '';
            return;
        }
        els.errorBox.textContent = message;
        els.errorBox.classList.remove('hidden');
    }

    function setProgress(current, total, text) {
        const t = Math.max(total || 1, 1);
        const pct = Math.round((current / t) * 100);
        els.progressBar.style.width = `${pct}%`;
        els.progressText.textContent = text || `${current}/${total}`;
    }

    function validateFiles(files) {
        if (!files.length) return 'Оберіть хоча б один DOCX файл';
        if (files.length > MAX_FILES) return `Забагато файлів: максимум ${MAX_FILES}`;
        const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalBytes > MAX_TOTAL_BYTES) return 'Занадто великий пакет файлів';
        return '';
    }

    function getElementText(el) {
        const nodes = el.getElementsByTagNameNS(WORD_NS, 't');
        let text = '';
        for (let i = 0; i < nodes.length; i++) text += nodes[i].textContent || '';
        return clean(text);
    }

    async function parseDocxFile(file) {
        const zip = await window.JSZip.loadAsync(file);
        const xmlStr = await zip.file('word/document.xml').async('string');
        const xml = new DOMParser().parseFromString(xmlStr, 'application/xml');
        const body = xml.getElementsByTagNameNS(WORD_NS, 'body')[0];
        if (!body) return [];

        const rowsOut = [];
        let paragraphBuffer = [];

        for (let i = 0; i < body.childNodes.length; i++) {
            const child = body.childNodes[i];
            if (!child || !child.localName) continue;

            if (child.localName === 'p') {
                const text = getElementText(child);
                if (text) paragraphBuffer.push(text);
                continue;
            }
            if (child.localName !== 'tbl') continue;

            const heading = paragraphBuffer[0] || '';
            paragraphBuffer = [];
            const groups = parseGroups(heading);

            const rows = child.getElementsByTagNameNS(WORD_NS, 'tr');
            let controlType = '';
            for (let r = 0; r < rows.length; r++) {
                if (r === 0) continue;
                const cells = rows[r].getElementsByTagNameNS(WORD_NS, 'tc');
                if (!cells.length) continue;

                const vals = [];
                for (let c = 0; c < cells.length; c++) vals.push(getElementText(cells[c]));
                while (vals.length < 7) vals.push('');

                const nonEmpty = vals.filter(Boolean);
                if (nonEmpty.length === 1 && vals[1]) {
                    controlType = vals[1];
                    continue;
                }
                if (!vals[1]) continue;

                rowsOut.push({
                    discipline: normalizeDiscipline(vals[1]),
                    groups: groups.length ? groups : ['—'],
                    teacherList: splitTeachers(vals[3]),
                    controlType: clean(controlType || vals[2] || ''),
                    sourceFile: file.name
                });
            }
        }
        return rowsOut;
    }

    function flattenForTable(items) {
        const out = [];
        items.forEach((it) => {
            (it.groups || ['—']).forEach((g) => {
                out.push({
                    discipline: clean(it.discipline),
                    group: clean(g),
                    teachers: Array.isArray(it.teacherList) ? it.teacherList.slice() : [],
                    controlType: clean(it.controlType || ''),
                    sourceFile: clean(it.sourceFile || '')
                });
            });
        });
        return out;
    }

    function dedupeRows(rows) {
        const map = new Map();
        rows.forEach((row) => {
            const d = normalizeDiscipline(row.discipline);
            const g = clean(row.group);
            if (!d || !g) return;
            const key = `${d}__${g}`;
            if (!map.has(key)) {
                map.set(key, { discipline: d, group: g, teachers: new Set(), controlType: clean(row.controlType) });
            }
            const target = map.get(key);
            splitTeachers((row.teachers || []).join('; ')).forEach((t) => target.teachers.add(t));
            if (!target.controlType && row.controlType) target.controlType = clean(row.controlType);
        });

        return Array.from(map.values())
            .map((x) => ({
                discipline: x.discipline,
                group: x.group,
                teachers: Array.from(x.teachers).filter(Boolean).sort((a, b) => a.localeCompare(b, 'uk')),
                controlType: x.controlType || ''
            }))
            .filter((x) => x.discipline && x.group && x.teachers.length > 0)
            .sort((a, b) => a.group.localeCompare(b.group, 'uk') || a.discipline.localeCompare(b.discipline, 'uk'));
    }

    function renderFilters(rows) {
        const groups = Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b, 'uk'));
        const teachers = Array.from(new Set(rows.flatMap((r) => r.teachers))).sort((a, b) => a.localeCompare(b, 'uk'));

        els.groupFilter.innerHTML = '<option value="">Усі групи</option>';
        groups.forEach((g) => {
            const o = document.createElement('option');
            o.value = g;
            o.textContent = g;
            els.groupFilter.appendChild(o);
        });

        els.teacherFilter.innerHTML = '<option value="">Усі викладачі</option>';
        teachers.forEach((t) => {
            const o = document.createElement('option');
            o.value = t;
            o.textContent = t;
            els.teacherFilter.appendChild(o);
        });
    }

    function renderTable(rows) {
        els.tableBody.innerHTML = '';
        rows.forEach((r, idx) => {
            const tr = document.createElement('tr');
            tr.className = idx % 2 ? 'bg-gray-50 dark:bg-gray-800/50' : '';
            tr.innerHTML = `
                <td class="px-2 py-2">${idx + 1}</td>
                <td class="px-2 py-2"><input data-field="discipline" data-index="${idx}" value="${r.discipline.replace(/"/g, '&quot;')}" class="w-full rounded border dark:border-gray-600 p-1 bg-white dark:bg-gray-700"></td>
                <td class="px-2 py-2"><input data-field="group" data-index="${idx}" value="${r.group.replace(/"/g, '&quot;')}" class="w-full rounded border dark:border-gray-600 p-1 bg-white dark:bg-gray-700"></td>
                <td class="px-2 py-2"><input data-field="teachers" data-index="${idx}" value="${r.teachers.join('; ').replace(/"/g, '&quot;')}" class="w-full rounded border dark:border-gray-600 p-1 bg-white dark:bg-gray-700"></td>
                <td class="px-2 py-2"><input data-field="controlType" data-index="${idx}" value="${(r.controlType || '').replace(/"/g, '&quot;')}" class="w-full rounded border dark:border-gray-600 p-1 bg-white dark:bg-gray-700"></td>
                <td class="px-2 py-2"><button data-action="remove" data-index="${idx}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити</button></td>
            `;
            els.tableBody.appendChild(tr);
        });
        els.countLabel.textContent = String(rows.length);
    }

    function applyFilters() {
        const q = clean(els.searchInput.value).toLowerCase();
        const g = clean(els.groupFilter.value);
        const t = clean(els.teacherFilter.value);
        state.filteredRows = state.rows.filter((r) => {
            if (g && r.group !== g) return false;
            if (t && !r.teachers.includes(t)) return false;
            if (!q) return true;
            const hay = `${r.discipline} ${r.group} ${r.teachers.join(' ')} ${r.controlType}`.toLowerCase();
            return hay.includes(q);
        });
        renderTable(state.filteredRows);
    }

    function syncEditedRowsFromUI() {
        const rows = state.filteredRows.slice();
        rows.forEach((r, idx) => {
            const d = document.querySelector(`input[data-field="discipline"][data-index="${idx}"]`);
            const g = document.querySelector(`input[data-field="group"][data-index="${idx}"]`);
            const t = document.querySelector(`input[data-field="teachers"][data-index="${idx}"]`);
            const c = document.querySelector(`input[data-field="controlType"][data-index="${idx}"]`);
            if (d) r.discipline = normalizeDiscipline(d.value);
            if (g) r.group = clean(g.value);
            if (t) r.teachers = splitTeachers(t.value);
            if (c) r.controlType = clean(c.value);
        });
        state.filteredRows = rows;
    }

    function replaceMainRowsFromFiltered() {
        const oldKeys = new Set(state.filteredRows.map((r) => `${r.discipline}__${r.group}`));
        const rest = state.rows.filter((r) => !oldKeys.has(`${r.discipline}__${r.group}`));
        state.rows = dedupeRows(rest.concat(state.filteredRows));
        renderFilters(state.rows);
        applyFilters();
    }

    async function parseAll() {
        showError('');
        const files = Array.from(els.docxFiles.files || []);
        const err = validateFiles(files);
        if (err) {
            showError(err);
            return;
        }
        if (!window.JSZip) {
            showError('JSZip не завантажений');
            return;
        }

        state.rows = [];
        state.sourceFiles = files.map((f) => f.name);
        setStatus('Парсинг DOCX...');
        setProgress(0, files.length, `0/${files.length}`);

        const all = [];
        for (let i = 0; i < files.length; i++) {
            setProgress(i, files.length, `Обробка: ${files[i].name}`);
            const part = await parseDocxFile(files[i]);
            all.push(...part);
            setProgress(i + 1, files.length, `Готово: ${i + 1}/${files.length}`);
        }

        state.rows = dedupeRows(flattenForTable(all));
        renderFilters(state.rows);
        applyFilters();
        setStatus(`Готово: ${state.rows.length} записів`);
    }

    function normalizeAndDedupe() {
        syncEditedRowsFromUI();
        state.rows = dedupeRows(state.rows.concat(state.filteredRows));
        renderFilters(state.rows);
        applyFilters();
        setStatus('Нормалізацію та об’єднання виконано');
    }

    function addCustomRow() {
        syncEditedRowsFromUI();
        replaceMainRowsFromFiltered();
        state.rows.unshift({
            discipline: 'Новий предмет',
            group: '',
            teachers: [],
            controlType: ''
        });
        renderFilters(state.rows);
        applyFilters();
        setStatus('Додано новий рядок. Впишіть предмет, групу і викладача.');
    }

    function removeFilteredRow(index) {
        syncEditedRowsFromUI();
        state.filteredRows.splice(index, 1);
        replaceMainRowsFromFiltered();
    }

    async function exportExcel() {
        syncEditedRowsFromUI();
        const rows = state.filteredRows;
        const data = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю']];
        rows.forEach((r, i) => data.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '']));
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 16 }, { wch: 45 }, { wch: 22 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SessionConstructor');
        XLSX.writeFile(wb, 'session_constructor.xlsx');
    }

    async function copyTable() {
        syncEditedRowsFromUI();
        const lines = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю'].join('\t')];
        state.filteredRows.forEach((r, i) => {
            lines.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || ''].join('\t'));
        });
        await navigator.clipboard.writeText(lines.join('\n'));
        setStatus('Таблицю скопійовано');
    }

    async function uploadToApi() {
        syncEditedRowsFromUI();
        const password = clean(els.adminPassword.value);
        if (!password) {
            showError('Введіть ADMIN_PASSWORD');
            return;
        }

        const term = clean(els.sessionTerm.value) || 'Session';
        const studyForm = clean(els.studyForm.value);
        const actor = clean(els.adminActor.value) || 'session-constructor';
        const items = state.filteredRows.map((r) => ({
            groupHeading: r.group,
            groups: [r.group],
            speciality: '',
            program: '',
            controlType: r.controlType || '',
            discipline: r.discipline,
            examForm: '',
            teacher: r.teachers.join('; '),
            date: '',
            time: '',
            room: '',
            sourceTable: 0,
            sourceFile: state.sourceFiles.join(', ') || 'manual'
        }));

        const payload = {
            password,
            actor,
            data: {
                sourceFile: state.sourceFiles.join(', ') || 'manual',
                generatedAt: new Date().toISOString(),
                term,
                studyForm,
                items
            }
        };

        setStatus('Завантаження в API...');
        showError('');
        const res = await fetch(API_SESSION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const raw = await res.text();
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) {}
        if (!res.ok) {
            throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
        }
        setStatus(`Успішно: додано ${json.added || 0}, всього ${json.count || 0} (сесія: ${json.term || term})`);
    }

    els.parseBtn.addEventListener('click', () => parseAll().catch((e) => showError(e.message || String(e))));
    els.normalizeBtn.addEventListener('click', normalizeAndDedupe);
    els.addRowBtn.addEventListener('click', addCustomRow);
    els.uploadBtn.addEventListener('click', () => uploadToApi().catch((e) => showError(e.message || String(e))));
    els.excelBtn.addEventListener('click', () => exportExcel().catch((e) => showError(e.message || String(e))));
    els.copyBtn.addEventListener('click', () => copyTable().catch((e) => showError(e.message || String(e))));
    els.searchInput.addEventListener('input', applyFilters);
    els.groupFilter.addEventListener('change', applyFilters);
    els.teacherFilter.addEventListener('change', applyFilters);

    els.tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action="remove"]');
        if (!btn) return;
        const idx = Number(btn.dataset.index);
        if (Number.isNaN(idx)) return;
        removeFilteredRow(idx);
    });

    setProgress(0, 1, 'Очікування файлів...');
    renderFilters([]);
    applyFilters();
})();

