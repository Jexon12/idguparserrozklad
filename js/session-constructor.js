/* Session Constructor: build from schedule (session-prep flow) + manual edits */
(function () {
    const API_PROXY = '/api/';
    const API_SESSION = '/api/session';
    const VUZ_ID = 11927;

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
        faculties: [],
        eduForms: [],
        courses: [],
        groups: [],
        rows: [],
        filteredRows: [],
        sourceFiles: []
    };

    function clean(v) {
        return String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function normalizeDiscipline(v) {
        return clean(v).replace(/^[\d\.\-\)\(]+\s*/g, '').replace(/[;:,]+$/g, '').trim();
    }
    function splitTeachers(value) {
        const raw = clean(value);
        if (!raw) return [];
        return Array.from(new Set(
            raw
                .replace(/\s*(,|\/|\|)\s*/g, '; ')
                .replace(/\s+та\s+/giu, '; ')
                .split(';')
                .map((x) => clean(x))
                .filter(Boolean)
        ));
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
    function setStatus(msg, isErr) {
        els.status.textContent = msg || '';
        els.status.className = isErr ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
    }
    function setProgress(current, total, label) {
        const t = Math.max(total || 1, 1);
        els.progressBar.style.width = `${Math.round((current / t) * 100)}%`;
        els.progressText.textContent = label || `${current}/${total}`;
    }

    async function fetchApi(action, params) {
        const url = new URL(API_PROXY + action, window.location.origin);
        url.searchParams.append('aVuzID', VUZ_ID);
        if (action === 'GetStudyGroups') url.searchParams.append('aGiveStudyTimes', 'false');
        else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') url.searchParams.append('aGiveStudyTimes', 'true');
        url.searchParams.append('_', Date.now());
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') url.searchParams.append(k, '');
            else if (typeof v === 'string' && !v.startsWith('"')) url.searchParams.append(k, `"${v}"`);
            else url.searchParams.append(k, v);
        });
        const res = await fetch(url);
        const text = await res.text();
        const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
        const json = jsonpMatch ? JSON.parse(jsonpMatch[1]) : JSON.parse(text);
        return json.d || json;
    }

    function renderSelect(el, items, placeholder) {
        el.innerHTML = `<option value="">${placeholder}</option>`;
        items.forEach((it) => {
            const o = document.createElement('option');
            o.value = String(it.Key || it.key || '');
            o.textContent = String(it.Value || it.value || '');
            el.appendChild(o);
        });
    }
    function renderFilters(rows) {
        const groups = Array.from(new Set(rows.map((r) => r.group))).sort((a, b) => a.localeCompare(b, 'uk'));
        const teachers = Array.from(new Set(rows.flatMap((r) => r.teachers))).sort((a, b) => a.localeCompare(b, 'uk'));
        els.groupFilter.innerHTML = '<option value="">Усі групи</option>';
        groups.forEach((g) => {
            const o = document.createElement('option'); o.value = g; o.textContent = g; els.groupFilter.appendChild(o);
        });
        els.teacherFilter.innerHTML = '<option value="">Усі викладачі</option>';
        teachers.forEach((t) => {
            const o = document.createElement('option'); o.value = t; o.textContent = t; els.teacherFilter.appendChild(o);
        });
    }

    function dedupeRows(rows) {
        const map = new Map();
        rows.forEach((r) => {
            const d = normalizeDiscipline(r.discipline);
            const g = clean(r.group);
            if (!d || !g) return;
            const key = `${d}__${g}`;
            if (!map.has(key)) map.set(key, { discipline: d, group: g, teachers: new Set(), controlType: clean(r.controlType || '') });
            splitTeachers((r.teachers || []).join('; ')).forEach((t) => map.get(key).teachers.add(t));
        });
        return Array.from(map.values()).map((x) => ({
            discipline: x.discipline,
            group: x.group,
            teachers: Array.from(x.teachers).sort((a, b) => a.localeCompare(b, 'uk')),
            controlType: x.controlType
        }));
    }

    function renderTable(rows) {
        els.tableBody.innerHTML = '';
        rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-2 py-2">${i + 1}</td>
                <td class="px-2 py-2"><input data-f="discipline" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${r.discipline.replace(/"/g, '&quot;')}"></td>
                <td class="px-2 py-2"><input data-f="group" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${r.group.replace(/"/g, '&quot;')}"></td>
                <td class="px-2 py-2"><input data-f="teachers" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${r.teachers.join('; ').replace(/"/g, '&quot;')}"></td>
                <td class="px-2 py-2"><input data-f="controlType" data-i="${i}" class="w-full rounded border p-1 bg-white dark:bg-gray-700" value="${(r.controlType || '').replace(/"/g, '&quot;')}"></td>
                <td class="px-2 py-2"><button data-act="del" data-i="${i}" class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Видалити</button></td>
            `;
            els.tableBody.appendChild(tr);
        });
        els.countLabel.textContent = String(rows.length);
    }

    function applyFilters() {
        const q = clean(els.searchInput.value).toLowerCase();
        const gf = clean(els.groupFilter.value);
        const tf = clean(els.teacherFilter.value);
        state.filteredRows = state.rows.filter((r) => {
            if (gf && r.group !== gf) return false;
            if (tf && !r.teachers.includes(tf)) return false;
            if (!q) return true;
            return `${r.discipline} ${r.group} ${r.teachers.join(' ')} ${r.controlType}`.toLowerCase().includes(q);
        });
        renderTable(state.filteredRows);
    }

    function syncFromGrid() {
        const list = state.filteredRows.slice();
        list.forEach((r, i) => {
            const d = document.querySelector(`input[data-f="discipline"][data-i="${i}"]`);
            const g = document.querySelector(`input[data-f="group"][data-i="${i}"]`);
            const t = document.querySelector(`input[data-f="teachers"][data-i="${i}"]`);
            const c = document.querySelector(`input[data-f="controlType"][data-i="${i}"]`);
            if (d) r.discipline = normalizeDiscipline(d.value);
            if (g) r.group = clean(g.value);
            if (t) r.teachers = splitTeachers(t.value);
            if (c) r.controlType = clean(c.value);
        });
        state.filteredRows = list;
    }

    function mergeFilteredBack() {
        const old = new Set(state.filteredRows.map((r) => `${r.discipline}__${r.group}`));
        const rest = state.rows.filter((r) => !old.has(`${r.discipline}__${r.group}`));
        state.rows = dedupeRows(rest.concat(state.filteredRows));
    }

    async function buildFromSchedule() {
        showError('');
        setStatus('Завантаження фільтрів...');
        setProgress(0, 1, 'Підготовка...');
        const base = await fetchApi('GetStudentScheduleFiltersData');
        const faculties = Array.isArray(base?.faculties) ? base.faculties : [];
        const forms = Array.isArray(base?.educForms) ? base.educForms : [];
        const courses = Array.isArray(base?.courses) ? base.courses : [];
        if (!faculties.length || !forms.length || !courses.length) throw new Error('Не вдалося отримати фільтри');

        // take user chosen form from select text if possible
        const selectedFormText = clean(els.studyForm.value);
        const selectedForm = forms.find((x) => clean(x.Value).toLowerCase() === selectedFormText.toLowerCase()) || forms[0];
        const faculty = faculties[0];

        const groups = [];
        for (let i = 0; i < courses.length; i++) {
            setProgress(i, courses.length, `Групи: ${i}/${courses.length}`);
            const res = await fetchApi('GetStudyGroups', { aFacultyID: faculty.Key, aEducationForm: selectedForm.Key, aCourse: courses[i].Key });
            (res?.studyGroups || []).forEach((g) => groups.push({ key: g.Key, value: clean(g.Value) }));
        }
        state.groups = Array.from(new Map(groups.map((x) => [x.key, x])).values());
        if (!state.groups.length) throw new Error('Не знайдено груп');

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const sDate = `01.${m}.${y}`;
        const eDate = `28.${m}.${y}`;

        const rawRows = [];
        for (let i = 0; i < state.groups.length; i++) {
            const g = state.groups[i];
            setProgress(i + 1, state.groups.length, `Розклад: ${i + 1}/${state.groups.length}`);
            const lessons = await fetchApi('GetScheduleDataX', { aStudyGroupID: g.key, aStartDate: sDate, aEndDate: eDate, aStudyTypeID: '' });
            (Array.isArray(lessons) ? lessons : []).forEach((l) => {
                rawRows.push({
                    discipline: normalizeDiscipline(l.discipline),
                    group: g.value,
                    teachers: splitTeachers(l.employee_short || l.employee || ''),
                    controlType: clean(l.study_type || '')
                });
            });
        }

        state.rows = dedupeRows(rawRows).filter((r) => r.discipline && r.group);
        renderFilters(state.rows);
        applyFilters();
        setStatus(`Сформовано ${state.rows.length} записів на базі розкладу`);
    }

    function addCustomRow() {
        syncFromGrid();
        mergeFilteredBack();
        state.rows.unshift({ discipline: 'Новий предмет', group: '', teachers: [], controlType: '' });
        renderFilters(state.rows);
        applyFilters();
    }

    async function uploadToApi() {
        syncFromGrid();
        mergeFilteredBack();
        applyFilters();
        if (!state.filteredRows.length) throw new Error('Немає записів для завантаження');
        const password = clean(els.adminPassword.value);
        if (!password) throw new Error('Введіть ADMIN_PASSWORD');

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
            sourceFile: (els.docxFiles.files?.[0]?.name || 'schedule-based')
        }));

        const payload = {
            password,
            actor: clean(els.adminActor.value) || 'session-constructor',
            data: {
                sourceFile: items[0]?.sourceFile || 'schedule-based',
                generatedAt: new Date().toISOString(),
                term: clean(els.sessionTerm.value) || 'Session',
                studyForm: clean(els.studyForm.value),
                items
            }
        };
        const res = await fetch(API_SESSION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const txt = await res.text();
        let json = null; try { json = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!res.ok) throw new Error((json && (json.error || json.message)) || `HTTP ${res.status}`);
        setStatus(`Успішно: додано ${json.added || 0}, всього ${json.count || 0} (сесія: ${json.term || ''})`);
    }

    function normalizeAction() {
        syncFromGrid();
        state.rows = dedupeRows(state.rows.concat(state.filteredRows));
        renderFilters(state.rows);
        applyFilters();
    }

    function exportExcel() {
        syncFromGrid();
        const rows = state.filteredRows;
        const header = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю']];
        rows.forEach((r, i) => header.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || '']));
        const ws = XLSX.utils.aoa_to_sheet(header);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Session');
        XLSX.writeFile(wb, 'session_constructor.xlsx');
    }

    async function copyTable() {
        syncFromGrid();
        const lines = [['№', 'Предмет', 'Група', 'Викладачі', 'Форма контролю'].join('\t')];
        state.filteredRows.forEach((r, i) => lines.push([i + 1, r.discipline, r.group, r.teachers.join('; '), r.controlType || ''].join('\t')));
        await navigator.clipboard.writeText(lines.join('\n'));
        setStatus('Таблицю скопійовано');
    }

    els.parseBtn.textContent = '1) Сформувати з розкладу (як session-prep)';
    els.normalizeBtn.textContent = '2) Нормалізувати/прибрати дублікати';

    els.parseBtn.addEventListener('click', () => buildFromSchedule().catch((e) => showError(e.message || String(e))));
    els.normalizeBtn.addEventListener('click', normalizeAction);
    els.addRowBtn.addEventListener('click', addCustomRow);
    els.uploadBtn.addEventListener('click', () => uploadToApi().catch((e) => showError(e.message || String(e))));
    els.excelBtn.addEventListener('click', exportExcel);
    els.copyBtn.addEventListener('click', () => copyTable().catch((e) => showError(e.message || String(e))));
    els.searchInput.addEventListener('input', applyFilters);
    els.groupFilter.addEventListener('change', applyFilters);
    els.teacherFilter.addEventListener('change', applyFilters);
    els.tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]');
        if (!btn) return;
        const i = Number(btn.dataset.i);
        if (Number.isNaN(i)) return;
        syncFromGrid();
        state.filteredRows.splice(i, 1);
        mergeFilteredBack();
        renderFilters(state.rows);
        applyFilters();
    });

    renderSelect(els.groupFilter, [], 'Усі групи');
    renderSelect(els.teacherFilter, [], 'Усі викладачі');
    setProgress(0, 1, 'Готово');
})();

