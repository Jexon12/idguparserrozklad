/** Shared conversion of DOCX/Excel table values into session rows. */
(function (root, factory) {
    let model = root?.ScheduleApp?.ScheduleModel;
    if (!model && typeof require === 'function') model = require('./schedule-model');
    const importer = factory(model);
    if (typeof module === 'object' && module.exports) module.exports = importer;
    if (root) {
        root.ScheduleApp = root.ScheduleApp || {};
        root.ScheduleApp.SessionImport = importer;
    }
})(typeof window !== 'undefined' ? window : globalThis, function (model) {
    const clean = model.cleanText;
    const controls = ['залік', 'іспит', 'захист', 'диф.залік'];

    const normalizeControlType = (value, fallback = 'залік') => {
        const text = clean(value).toLowerCase().replace(/\s+/g, '');
        if (/диф/.test(text) && /залік/.test(text)) return 'диф.залік';
        if (/іспит|экзамен|екзамен/.test(text)) return 'іспит';
        if (/захист/.test(text)) return 'захист';
        if (/залік|зачет|зачёт/.test(text)) return 'залік';
        return controls.includes(fallback) ? fallback : 'залік';
    };

    const parseGroups = (value) => {
        const matches = clean(value).match(/\d{1,3}\s*[\p{L}]?/gu) || [];
        return Array.from(new Set(matches.map((item) => item.replace(/\s+/g, '').toLowerCase())));
    };

    const fromCells = (cells, options = {}) => {
        const values = Array.from(cells || [], clean);
        const map = {
            discipline: 1,
            group: 2,
            teachers: 3,
            controlType: 4,
            date: 5,
            time: 6,
            room: 7,
            ...(options.map || {})
        };
        const discipline = model.normalizeDiscipline(values[map.discipline] || values[0]);
        if (!discipline) return null;
        const groups = options.groups?.length
            ? Array.from(new Set(options.groups.map(clean).filter(Boolean)))
            : parseGroups(values[map.group] || options.groupHeading);
        const teachers = model.splitTeachers(values[map.teachers]);
        return {
            discipline,
            group: groups.join(', '),
            groups,
            teachers,
            teacher: teachers.join('; '),
            controlType: normalizeControlType(values[map.controlType], options.controlType),
            date: clean(values[map.date]),
            time: clean(values[map.time]),
            room: clean(values[map.room]),
            examForm: map.examForm === undefined ? '' : clean(values[map.examForm]),
            groupHeading: clean(options.groupHeading),
            sourceFile: clean(options.sourceFile),
            sourceTable: Number(options.sourceTable) || 0
        };
    };

    const fromRows = (rows, options = {}) => Array.from(rows || [])
        .slice(options.skipHeader === false ? 0 : 1)
        .map((cells) => fromCells(cells, options))
        .filter(Boolean);

    const dedupeRows = (rows) => {
        const unique = new Map();
        Array.from(rows || []).forEach((row) => {
            const key = [row.discipline, row.group || (row.groups || []).join(','), row.controlType, row.date, row.time, row.room]
                .map((value) => clean(value).toLowerCase()).join('|');
            if (!unique.has(key)) unique.set(key, row);
        });
        return Array.from(unique.values());
    };

    return { controls, normalizeControlType, parseGroups, fromCells, fromRows, dedupeRows };
});
