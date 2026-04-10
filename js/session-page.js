(function () {
    const state = {
        items: [],
        filtered: []
    };

    const els = {
        term: document.getElementById('filterTerm'),
        studyForm: document.getElementById('filterStudyForm'),
        group: document.getElementById('filterGroup'),
        teacher: document.getElementById('filterTeacher'),
        controlType: document.getElementById('filterControlType'),
        discipline: document.getElementById('filterDiscipline'),
        date: document.getElementById('filterDate'),
        reset: document.getElementById('resetFilters'),
        exportBtn: document.getElementById('exportFiltered'),
        tbody: document.getElementById('sessionTableBody'),
        count: document.getElementById('resultCount'),
        source: document.getElementById('sourceInfo'),
        chips: document.getElementById('quickGroupChips')
    };

    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const toNorm = (value) => clean(value).toLowerCase();
    const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));

    const extractTeacherNames = (value) => {
        const raw = clean(value).replace(/[\u200e\u200f]/g, '');
        if (!raw) return [];

        const regex = /([А-ЯІЇЄҐ][а-яіїєґ'’\-]+)\s*([А-ЯІЇЄҐ])\.\s*([А-ЯІЇЄҐ])\.?/g;
        const names = [];
        let match;
        while ((match = regex.exec(raw)) !== null) {
            const full = `${match[1]} ${match[2]}.${match[3]}.`;
            if (!names.includes(full)) names.push(full);
        }

        if (names.length) return names;

        return raw
            .replace(/\s*(,|\/|;)\s*/g, '; ')
            .replace(/\s+та\s+/gi, '; ')
            .split(';')
            .map((part) => clean(part))
            .filter(Boolean);
    };

    const parseSessionDate = (dateValue) => {
        const parts = String(dateValue || '').split('.');
        if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (!day || !month) return Number.MAX_SAFE_INTEGER;
        const year = month <= 2 ? 2026 : 2025;
        return new Date(year, month - 1, day).getTime();
    };

    const collectGroups = (items) => {
        const groups = [];
        items.forEach((item) => {
            (item.groups || []).forEach((g) => groups.push(g));
        });
        return uniqSorted(groups);
    };

    const fillSelect = (selectEl, values, firstLabel, withFirst = true) => {
        selectEl.innerHTML = '';
        if (withFirst) {
            const first = document.createElement('option');
            first.value = '';
            first.textContent = firstLabel;
            selectEl.appendChild(first);
        }
        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            selectEl.appendChild(option);
        });
    };

    const buildChips = (groups) => {
        els.chips.innerHTML = '';
        groups.slice(0, 30).forEach((group) => {
            const btn = document.createElement('button');
            btn.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200';
            btn.textContent = group;
            btn.addEventListener('click', () => {
                els.group.value = group;
                applyFilters();
            });
            els.chips.appendChild(btn);
        });
    };

    const applyGroupFromUrl = () => {
        const url = new URL(window.location.href);
        const queryGroup = url.searchParams.get('group');
        const hashGroup = new URLSearchParams((url.hash || '').replace(/^#/, '')).get('group');
        const requested = clean(queryGroup || hashGroup || '');
        if (!requested) return;
        const options = Array.from(els.group.options).map((opt) => opt.value);
        const exact = options.find((opt) => toNorm(opt) === toNorm(requested));
        els.group.value = exact || requested;
    };

    const renderRows = () => {
        els.tbody.innerHTML = '';
        if (!state.filtered.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="9" class="px-3 py-5 text-center text-sm text-gray-500">Нічого не знайдено за поточними фільтрами</td>';
            els.tbody.appendChild(tr);
            els.count.textContent = '0';
            return;
        }

        const fragment = document.createDocumentFragment();
        state.filtered.forEach((item) => {
            const teacherNames = (item.teacherNames && item.teacherNames.length)
                ? item.teacherNames
                : extractTeacherNames(item.teacher);
            const teacherCell = teacherNames.length
                ? `<div class="flex flex-wrap gap-1">${teacherNames.map((n) => `<span class="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold">${n}</span>`).join('')}</div>`
                : '—';

            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-100 dark:border-gray-700';
            tr.innerHTML = `
                <td class="px-3 py-2 align-top text-xs font-semibold">${(item.groups || []).join(', ') || item.groupHeading || '—'}</td>
                <td class="px-3 py-2 align-top text-sm">${item.discipline || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.controlType || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.examForm || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${teacherCell}</td>
                <td class="px-3 py-2 align-top text-xs">${item.date || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.time || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.room || '—'}</td>
                <td class="px-3 py-2 align-top text-[11px] text-gray-500 dark:text-gray-400">${item.speciality || '—'}</td>
            `;
            fragment.appendChild(tr);
        });

        els.tbody.appendChild(fragment);
        els.count.textContent = String(state.filtered.length);
    };

    const applyFilters = () => {
        const fTerm = toNorm(els.term.value);
        const fStudyForm = toNorm(els.studyForm.value);
        const fGroup = toNorm(els.group.value);
        const fTeachers = Array.from(els.teacher.selectedOptions || []).map((opt) => toNorm(opt.value)).filter(Boolean);
        const fControlType = toNorm(els.controlType.value);
        const fDiscipline = toNorm(els.discipline.value);
        const fDate = toNorm(els.date.value);

        state.filtered = state.items.filter((item) => {
            const groupsNorm = toNorm((item.groups || []).join(' ') + ' ' + (item.groupHeading || ''));
            const teacherNorm = toNorm(item.teacher);
            const teacherNamesNorm = (item.teacherNames || []).map((n) => toNorm(n));
            const controlTypeNorm = toNorm(item.controlType);
            const disciplineNorm = toNorm(item.discipline);
            const dateNorm = toNorm(item.date);
            const termNorm = toNorm(item.term);
            const studyFormNorm = toNorm(item.studyForm);

            if (fTerm && termNorm !== fTerm) return false;
            if (fStudyForm && studyFormNorm !== fStudyForm) return false;
            if (fGroup && !groupsNorm.includes(fGroup)) return false;
            if (fTeachers.length) {
                const hasAny = fTeachers.some((teacher) => teacherNamesNorm.includes(teacher) || teacherNorm.includes(teacher));
                if (!hasAny) return false;
            }
            if (fControlType && controlTypeNorm !== fControlType) return false;
            if (fDiscipline && !disciplineNorm.includes(fDiscipline)) return false;
            if (fDate && !dateNorm.includes(fDate)) return false;
            return true;
        }).sort((a, b) => parseSessionDate(a.date) - parseSessionDate(b.date));

        renderRows();
    };

    const exportFiltered = () => {
        if (!window.XLSX) {
            alert('XLSX бібліотека не завантажена');
            return;
        }

        const rows = [[
            'Сесія',
            'Форма навчання',
            'Група',
            'Дисципліна',
            'Тип',
            'Форма',
            'Викладач',
            'Дата',
            'Час',
            'Аудиторія',
            'Спеціальність'
        ]];

        state.filtered.forEach((item) => {
            rows.push([
                item.term || '',
                item.studyForm || '',
                (item.groups || []).join(', ') || item.groupHeading || '',
                item.discipline || '',
                item.controlType || '',
                item.examForm || '',
                (item.teacherNames || []).join('; ') || item.teacher || '',
                item.date || '',
                item.time || '',
                item.room || '',
                item.speciality || ''
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Session');
        XLSX.writeFile(wb, `session_filtered_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const initFilters = () => {
        fillSelect(els.term, uniqSorted(state.items.map((i) => i.term)), 'Усі сесії');
        fillSelect(els.studyForm, uniqSorted(state.items.map((i) => i.studyForm)), 'Усі форми');
        fillSelect(els.group, collectGroups(state.items), 'Усі групи');
        fillSelect(els.teacher, uniqSorted(state.items.flatMap((i) => i.teacherNames || [])), 'Усі викладачі', false);
        fillSelect(els.controlType, uniqSorted(state.items.map((i) => i.controlType)), 'Усі типи');
        buildChips(collectGroups(state.items));
        applyGroupFromUrl();
    };

    const bindEvents = () => {
        ['change', 'input'].forEach((evt) => {
            els.term.addEventListener(evt, applyFilters);
            els.studyForm.addEventListener(evt, applyFilters);
            els.group.addEventListener(evt, applyFilters);
            els.teacher.addEventListener(evt, applyFilters);
            els.controlType.addEventListener(evt, applyFilters);
            els.discipline.addEventListener(evt, applyFilters);
            els.date.addEventListener(evt, applyFilters);
        });

        els.reset.addEventListener('click', () => {
            els.term.value = '';
            els.studyForm.value = '';
            els.group.value = '';
            Array.from(els.teacher.options).forEach((opt) => { opt.selected = false; });
            els.controlType.value = '';
            els.discipline.value = '';
            els.date.value = '';
            applyFilters();
        });

        if (els.exportBtn) {
            els.exportBtn.addEventListener('click', exportFiltered);
        }
    };

    const loadData = async () => {
        let data = null;
        let storageLabel = '';

        const apiRes = await fetch('/api/session');
        if (apiRes.ok) {
            data = await apiRes.json();
            storageLabel = data.storage || 'api';
        }

        if (!data || !Array.isArray(data.items)) {
            const fallbackRes = await fetch('/data/session-2025-26.json?v=20260410-3');
            if (!fallbackRes.ok) throw new Error('Не вдалося завантажити дані сесії');
            data = await fallbackRes.json();
            storageLabel = 'file-fallback';
        }

        state.items = (Array.isArray(data.items) ? data.items : []).map((item) => {
            const teacherNames = extractTeacherNames(item.teacher);
            return {
                ...item,
                term: item.term || data.term || '',
                studyForm: item.studyForm || data.studyForm || '',
                teacherNames,
                teacher: teacherNames.join('; ') || clean(item.teacher)
            };
        });

        const generated = data.generatedAt ? new Date(data.generatedAt).toLocaleString('uk-UA') : '—';
        const source = data.sourceFile || 'session';
        els.source.textContent = `Джерело: ${source} · оновлено: ${generated} · storage: ${storageLabel}`;
    };

    const start = async () => {
        try {
            bindEvents();
            await loadData();
            initFilters();
            applyFilters();
        } catch (err) {
            els.tbody.innerHTML = `<tr><td colspan="9" class="px-3 py-5 text-center text-red-600">${err.message}</td></tr>`;
        }
    };

    start();
})();
