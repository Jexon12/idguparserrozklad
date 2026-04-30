/* Session Prep Builder: subject + group + teachers table */
(function () {
    const API_PROXY = '/api/';
    const VUZ_ID = 11927;

    const state = {
        faculties: [],
        eduForms: [],
        courses: [],
        groups: [],
        rows: [],
        filteredRows: [],
        teachers: []
    };

    const el = {
        facultySelect: document.getElementById('facultySelect'),
        eduFormSelect: document.getElementById('eduFormSelect'),
        startDate: document.getElementById('startDate'),
        endDate: document.getElementById('endDate'),
        coursesBox: document.getElementById('coursesBox'),
        groupsBox: document.getElementById('groupsBox'),
        teachersBox: document.getElementById('teachersBox'),
        groupFilter: document.getElementById('groupFilter'),
        searchInput: document.getElementById('searchInput'),
        loadingBadge: document.getElementById('loadingBadge'),
        errorBox: document.getElementById('errorBox'),
        tableBody: document.getElementById('tableBody'),
        countLabel: document.getElementById('countLabel'),
        buildBtn: document.getElementById('buildBtn'),
        excelBtn: document.getElementById('excelBtn'),
        copyBtn: document.getElementById('copyBtn'),
        selectAllCourses: document.getElementById('selectAllCourses'),
        clearCourses: document.getElementById('clearCourses'),
        selectAllGroups: document.getElementById('selectAllGroups'),
        clearGroups: document.getElementById('clearGroups'),
        selectAllTeachers: document.getElementById('selectAllTeachers'),
        clearTeachers: document.getElementById('clearTeachers')
    };

    function setLoading(flag, text) {
        el.loadingBadge.textContent = text || 'Завантаження...';
        el.loadingBadge.classList.toggle('hidden', !flag);
    }

    function showError(message) {
        if (!message) {
            el.errorBox.classList.add('hidden');
            el.errorBox.textContent = '';
            return;
        }
        el.errorBox.textContent = message;
        el.errorBox.classList.remove('hidden');
    }

    function normalizeText(v) {
        return String(v || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[\u0000-\u001F]+/g, ' ')
            .replace(/[“”«»"]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeDiscipline(v) {
        return normalizeText(v)
            .replace(/^[\d\.\-\)\(]+\s*/g, '')
            .replace(/[;:,]+$/g, '')
            .trim();
    }

    function splitTeachers(raw) {
        const source = normalizeText(raw)
            .replace(/\s*;\s*/g, ',')
            .replace(/\s*\/\s*/g, ',')
            .replace(/\s*\|\s*/g, ',');
        const parts = source.split(',').map((x) => normalizeText(x)).filter(Boolean);
        return Array.from(new Set(parts));
    }

    function formatDateForApi(isoDate) {
        const [y, m, d] = String(isoDate || '').split('-');
        if (!y || !m || !d) return '';
        return `${d}.${m}.${y}`;
    }

    async function fetchApi(action, params = {}) {
        const url = new URL(API_PROXY + action, window.location.origin);
        url.searchParams.append('aVuzID', VUZ_ID);
        if (action === 'GetStudyGroups') {
            url.searchParams.append('aGiveStudyTimes', 'false');
        } else if (!action.startsWith('GetScheduleData') && action !== 'GetEmployees') {
            url.searchParams.append('aGiveStudyTimes', 'true');
        }
        url.searchParams.append('_', Date.now());

        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') {
                url.searchParams.append(k, '');
            } else if (typeof v === 'string' && !v.startsWith('"')) {
                url.searchParams.append(k, `"${v}"`);
            } else {
                url.searchParams.append(k, v);
            }
        });

        const res = await fetch(url);
        const text = await res.text();
        const jsonpMatch = text.match(/^[a-zA-Z0-9_]+\(([\s\S]*)\);?\s*$/);
        const json = jsonpMatch ? JSON.parse(jsonpMatch[1]) : JSON.parse(text);
        return json.d || json;
    }

    /* Required: load faculties/forms/courses */
    async function loadFacultiesFormsCourses() {
        const data = await fetchApi('GetStudentScheduleFiltersData');
        state.faculties = Array.isArray(data?.faculties) ? data.faculties : [];
        state.eduForms = Array.isArray(data?.educForms) ? data.educForms : [];
        state.courses = Array.isArray(data?.courses) ? data.courses : [];
    }

    /* Required: load groups for selected faculty/form/course set */
    async function loadGroups() {
        const faculty = el.facultySelect.value;
        const form = el.eduFormSelect.value;
        const selectedCourses = getCheckedValues('course');
        if (!faculty || !form || selectedCourses.length === 0) {
            state.groups = [];
            renderCheckboxes(el.groupsBox, [], 'group');
            return;
        }

        setLoading(true, 'Завантаження груп...');
        const list = [];
        for (const course of selectedCourses) {
            const res = await fetchApi('GetStudyGroups', {
                aFacultyID: faculty,
                aEducationForm: form,
                aCourse: course
            });
            const groups = Array.isArray(res?.studyGroups) ? res.studyGroups : [];
            groups.forEach((g) => {
                list.push({
                    key: String(g.Key || ''),
                    value: normalizeText(g.Value || '')
                });
            });
        }
        const unique = new Map();
        list.forEach((x) => { if (x.key && x.value && !unique.has(x.key)) unique.set(x.key, x); });
        state.groups = Array.from(unique.values()).sort((a, b) => a.value.localeCompare(b.value, 'uk'));
        renderCheckboxes(el.groupsBox, state.groups, 'group');
        setLoading(false);
    }

    /* Required: load one group schedule */
    async function loadGroupSchedule(groupKey, startDate, endDate) {
        const data = await fetchApi('GetScheduleDataX', {
            aStudyGroupID: groupKey,
            aStartDate: startDate,
            aEndDate: endDate,
            aStudyTypeID: ''
        });
        return Array.isArray(data) ? data : [];
    }

    function renderSelect(selectEl, items, placeholder) {
        selectEl.innerHTML = '';
        const first = document.createElement('option');
        first.value = '';
        first.textContent = placeholder;
        selectEl.appendChild(first);
        items.forEach((it) => {
            const o = document.createElement('option');
            o.value = String(it.Key || it.key || '');
            o.textContent = String(it.Value || it.value || '');
            selectEl.appendChild(o);
        });
        if (items.length) selectEl.value = String(items[0].Key || items[0].key || '');
    }

    function renderCheckboxes(container, items, kind) {
        container.innerHTML = '';
        items.forEach((it, idx) => {
            const id = `${kind}_${idx}_${String(it.key || it.Key || '')}`;
            const label = document.createElement('label');
            label.className = 'flex items-start gap-2 text-sm break-words';
            label.innerHTML = `<input type="checkbox" class="mt-0.5 shrink-0" data-kind="${kind}" value="${String(it.key || it.Key || '')}" checked> <span class="leading-5 break-words">${String(it.value || it.Value || '')}</span>`;
            label.querySelector('input').id = id;
            container.appendChild(label);
        });
    }

    function getCheckedValues(kind) {
        return Array.from(document.querySelectorAll(`input[type="checkbox"][data-kind="${kind}"]:checked`))
            .map((x) => x.value)
            .filter(Boolean);
    }

    function getCheckedTeacherNames() {
        const selected = getCheckedValues('teacher');
        if (selected.length === 0) return [];
        return selected;
    }

    function applyTableFilters() {
        const q = normalizeText(el.searchInput.value).toLowerCase();
        const groupVal = el.groupFilter.value;
        const teacherFilter = new Set(getCheckedTeacherNames());

        state.filteredRows = state.rows.filter((row) => {
            if (groupVal && row.group !== groupVal) return false;
            if (teacherFilter.size > 0) {
                const hasTeacher = row.teachers.some((t) => teacherFilter.has(t));
                if (!hasTeacher) return false;
            }
            if (!q) return true;
            const hay = `${row.subject} ${row.group} ${row.teachers.join(', ')}`.toLowerCase();
            return hay.includes(q);
        });

        renderTable(state.filteredRows);
    }

    function renderGroupFilterOptions(rows) {
        const groups = Array.from(new Set(rows.map((x) => x.group))).sort((a, b) => a.localeCompare(b, 'uk'));
        el.groupFilter.innerHTML = '<option value="">Усі групи</option>';
        groups.forEach((g) => {
            const o = document.createElement('option');
            o.value = g;
            o.textContent = g;
            el.groupFilter.appendChild(o);
        });
    }

    function renderTeacherFilterOptions(rows) {
        const teacherSet = new Set();
        rows.forEach((r) => r.teachers.forEach((t) => teacherSet.add(t)));
        state.teachers = Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'uk'));
        renderCheckboxes(el.teachersBox, state.teachers.map((t) => ({ key: t, value: t })), 'teacher');
    }

    function renderTable(rows) {
        el.tableBody.innerHTML = '';
        rows.forEach((r, idx) => {
            const tr = document.createElement('tr');
            tr.className = idx % 2 ? 'bg-gray-50 dark:bg-gray-800/50' : '';
            tr.innerHTML = `
                <td class="px-3 py-2">${idx + 1}</td>
                <td class="px-3 py-2">${r.subject}</td>
                <td class="px-3 py-2">${r.group}</td>
                <td class="px-3 py-2">${r.teachers.join(', ')}</td>
            `;
            el.tableBody.appendChild(tr);
        });
        el.countLabel.textContent = String(rows.length);
    }

    /* Required: normalize subjects + merge teachers */
    function buildRows(groupLessonsMap) {
        const map = new Map();

        Object.entries(groupLessonsMap).forEach(([groupName, lessons]) => {
            lessons.forEach((l) => {
                const subject = normalizeDiscipline(l.discipline);
                if (!subject) return;
                const teachers = splitTeachers(l.employee_short || l.employee || l.teacher || '');
                const key = `${subject}__${groupName}`;
                if (!map.has(key)) {
                    map.set(key, { subject, group: groupName, teachers: new Set() });
                }
                const entry = map.get(key);
                teachers.forEach((t) => entry.teachers.add(t));
            });
        });

        const rows = Array.from(map.values())
            .map((x) => ({
                subject: x.subject,
                group: x.group,
                teachers: Array.from(x.teachers).filter(Boolean).sort((a, b) => a.localeCompare(b, 'uk'))
            }))
            .filter((x) => x.subject && x.group && x.teachers.length > 0)
            .sort((a, b) => a.group.localeCompare(b.group, 'uk') || a.subject.localeCompare(b.subject, 'uk'));

        return rows;
    }

    /* Required: export to Excel */
    function exportToExcel(rows) {
        const data = [['№', 'Предмет', 'Група', 'Викладачі']];
        rows.forEach((r, i) => data.push([i + 1, r.subject, r.group, r.teachers.join(', ')]));
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 6 }, { wch: 50 }, { wch: 16 }, { wch: 45 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'SessionPrep');
        XLSX.writeFile(wb, 'session_prep.xlsx');
    }

    async function copyTable(rows) {
        const lines = [['№', 'Предмет', 'Група', 'Викладачі'].join('\t')];
        rows.forEach((r, i) => lines.push([i + 1, r.subject, r.group, r.teachers.join(', ')].join('\t')));
        await navigator.clipboard.writeText(lines.join('\n'));
    }

    function setAllChecked(kind, flag) {
        document.querySelectorAll(`input[type="checkbox"][data-kind="${kind}"]`).forEach((x) => {
            x.checked = flag;
        });
    }

    async function build() {
        showError('');
        const selectedGroups = getCheckedValues('group');
        if (selectedGroups.length === 0) {
            showError('Оберіть хоча б одну групу');
            return;
        }

        const start = formatDateForApi(el.startDate.value);
        const end = formatDateForApi(el.endDate.value);
        if (!start || !end) {
            showError('Вкажіть період дат');
            return;
        }

        const byKey = new Map(state.groups.map((g) => [g.key, g.value]));
        const lessonsByGroup = {};

        setLoading(true, 'Збір розкладу груп...');
        for (let i = 0; i < selectedGroups.length; i++) {
            const key = selectedGroups[i];
            const groupName = byKey.get(key) || key;
            setLoading(true, `Збір розкладу: ${i + 1}/${selectedGroups.length}`);
            const lessons = await loadGroupSchedule(key, start, end);
            lessonsByGroup[groupName] = lessons;
        }
        setLoading(false);

        state.rows = buildRows(lessonsByGroup);
        renderGroupFilterOptions(state.rows);
        renderTeacherFilterOptions(state.rows);
        applyTableFilters();
    }

    function setDefaultDates() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        const toIso = (d) => d.toISOString().slice(0, 10);
        el.startDate.value = toIso(first);
        el.endDate.value = toIso(last);
    }

    async function init() {
        try {
            setDefaultDates();
            setLoading(true, 'Завантаження фільтрів...');
            await loadFacultiesFormsCourses();
            renderSelect(el.facultySelect, state.faculties, 'Оберіть факультет');
            renderSelect(el.eduFormSelect, state.eduForms, 'Оберіть форму навчання');
            renderCheckboxes(el.coursesBox, state.courses.map((c) => ({ key: c.Key, value: c.Value })), 'course');
            await loadGroups();
            setLoading(false);
        } catch (e) {
            setLoading(false);
            showError(`Помилка ініціалізації: ${e.message || e}`);
        }
    }

    el.facultySelect.addEventListener('change', () => loadGroups().catch((e) => showError(e.message)));
    el.eduFormSelect.addEventListener('change', () => loadGroups().catch((e) => showError(e.message)));
    el.coursesBox.addEventListener('change', () => loadGroups().catch((e) => showError(e.message)));

    el.groupFilter.addEventListener('change', applyTableFilters);
    el.searchInput.addEventListener('input', applyTableFilters);
    el.teachersBox.addEventListener('change', applyTableFilters);

    el.buildBtn.addEventListener('click', () => build().catch((e) => showError(e.message || String(e))));
    el.excelBtn.addEventListener('click', () => exportToExcel(state.filteredRows));
    el.copyBtn.addEventListener('click', async () => {
        try {
            await copyTable(state.filteredRows);
        } catch (e) {
            showError('Не вдалося скопіювати таблицю');
        }
    });

    el.selectAllCourses.addEventListener('click', () => { setAllChecked('course', true); loadGroups(); });
    el.clearCourses.addEventListener('click', () => { setAllChecked('course', false); loadGroups(); });
    el.selectAllGroups.addEventListener('click', () => setAllChecked('group', true));
    el.clearGroups.addEventListener('click', () => setAllChecked('group', false));
    el.selectAllTeachers.addEventListener('click', () => { setAllChecked('teacher', true); applyTableFilters(); });
    el.clearTeachers.addEventListener('click', () => { setAllChecked('teacher', false); applyTableFilters(); });

    init();
})();
