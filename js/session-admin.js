(function () {
    const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    const els = {
        password: document.getElementById('adminPassword'),
        term: document.getElementById('sessionTerm'),
        files: document.getElementById('docxFiles'),
        parseBtn: document.getElementById('parseFiles'),
        uploadBtn: document.getElementById('uploadData'),
        status: document.getElementById('adminStatus'),
        fileCount: document.getElementById('fileCount'),
        itemCount: document.getElementById('itemCount'),
        groupPreview: document.getElementById('groupPreview')
    };

    const state = {
        filesParsed: [],
        items: []
    };

    const setStatus = (msg, isError) => {
        els.status.textContent = msg;
        els.status.className = isError ? 'text-sm text-red-600' : 'text-sm text-gray-600 dark:text-gray-300';
    };

    const clean = (value) => String(value || '')
        .replace(/[\u200e\u200f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const parseGroups = (heading) => {
        const raw = String(heading || '');
        const tokens = raw.match(/\d{1,3}\s*\w*/g) || [];
        const out = [];
        tokens.forEach((token) => {
            const normalized = clean(token.replace(/(\d)(\D)/, '$1 $2'));
            if (normalized && !out.includes(normalized)) out.push(normalized);
        });
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
                    teacher: vals[3],
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

        groups.slice(0, 40).forEach((group) => {
            const chip = document.createElement('span');
            chip.className = 'px-2 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800';
            chip.textContent = group;
            els.groupPreview.appendChild(chip);
        });
    };

    const parseAll = async () => {
        const files = Array.from(els.files.files || []);
        if (!files.length) {
            setStatus('Оберіть хоча б один .docx файл', true);
            return;
        }
        if (!window.JSZip) {
            setStatus('JSZip не завантажений', true);
            return;
        }

        setStatus('Парсинг файлів...');
        state.filesParsed = files.map((f) => f.name);
        state.items = [];

        for (const file of files) {
            try {
                const rows = await parseDocxFile(file);
                state.items.push(...rows);
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
        const password = els.password.value;
        if (!password) {
            setStatus('Введіть ADMIN_PASSWORD', true);
            return;
        }

        const payload = {
            password,
            data: {
                sourceFile: state.filesParsed.join(', '),
                generatedAt: new Date().toISOString(),
                term: clean(els.term.value) || 'Session',
                items: state.items
            }
        };

        setStatus('Завантажую дані в API...');
        try {
            const res = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload failed');
            setStatus(`Успішно збережено (${json.count} записів, storage: ${json.storage})`);
        } catch (e) {
            setStatus(`Помилка завантаження: ${e.message}`, true);
        }
    };

    els.parseBtn.addEventListener('click', parseAll);
    els.uploadBtn.addEventListener('click', uploadData);
})();
