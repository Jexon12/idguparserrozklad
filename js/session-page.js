(function () {
    const state = {
        items: [],
        filtered: []
    };

    const els = {
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

    const toNorm = (v) => String(v || '').toLowerCase().trim();
    const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));

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
        const out = [];
        items.forEach((item) => {
            (item.groups || []).forEach((group) => out.push(group));
        });
        return uniqSorted(out);
    };

    const fillSelect = (selectEl, values, firstLabel) => {
        selectEl.innerHTML = '';
        const first = document.createElement('option');
        first.value = '';
        first.textContent = firstLabel;
        selectEl.appendChild(first);
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
        const requested = (queryGroup || hashGroup || '').trim();
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
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-100 dark:border-gray-700';
            tr.innerHTML = `
                <td class="px-3 py-2 align-top text-xs font-semibold">${(item.groups || []).join(', ') || item.groupHeading || '—'}</td>
                <td class="px-3 py-2 align-top text-sm">${item.discipline || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.controlType || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.examForm || '—'}</td>
                <td class="px-3 py-2 align-top text-xs">${item.teacher || '—'}</td>
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
        const fGroup = toNorm(els.group.value);
        const fTeacher = toNorm(els.teacher.value);
        const fControlType = toNorm(els.controlType.value);
        const fDiscipline = toNorm(els.discipline.value);
        const fDate = toNorm(els.date.value);

        state.filtered = state.items.filter((item) => {
            const groupsNorm = toNorm((item.groups || []).join(' ') + ' ' + (item.groupHeading || ''));
            const teacherNorm = toNorm(item.teacher);
            const controlTypeNorm = toNorm(item.controlType);
            const disciplineNorm = toNorm(item.discipline);
            const dateNorm = toNorm(item.date);

            if (fGroup && !groupsNorm.includes(fGroup)) return false;
            if (fTeacher && !teacherNorm.includes(fTeacher)) return false;
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
                (item.groups || []).join(', ') || item.groupHeading || '',
                item.discipline || '',
                item.controlType || '',
                item.examForm || '',
                item.teacher || '',
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
        fillSelect(els.group, collectGroups(state.items), 'Усі групи');
        fillSelect(els.teacher, uniqSorted(state.items.map((item) => item.teacher)), 'Усі викладачі');
        fillSelect(els.controlType, uniqSorted(state.items.map((item) => item.controlType)), 'Усі типи');
        buildChips(collectGroups(state.items));
        applyGroupFromUrl();
    };

    const bindEvents = () => {
        ['change', 'input'].forEach((evt) => {
            els.group.addEventListener(evt, applyFilters);
            els.teacher.addEventListener(evt, applyFilters);
            els.controlType.addEventListener(evt, applyFilters);
            els.discipline.addEventListener(evt, applyFilters);
            els.date.addEventListener(evt, applyFilters);
        });

        els.reset.addEventListener('click', () => {
            els.group.value = '';
            els.teacher.value = '';
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
            const fallbackRes = await fetch('/data/session-2025-26.json?v=20260410-2');
            if (!fallbackRes.ok) throw new Error('Не вдалося завантажити дані сесії');
            data = await fallbackRes.json();
            storageLabel = 'file-fallback';
        }

        state.items = Array.isArray(data.items) ? data.items : [];
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
