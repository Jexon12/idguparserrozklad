(function (root, factory) {
  let domain = root?.ScheduleApp?.SessionDomain, importer = root?.ScheduleApp?.SessionImport;
  if (typeof require === 'function') { domain = domain || require('./session-domain'); importer = importer || require('./session-import'); }
  const preview = factory(domain, importer);
  if (typeof module === 'object' && module.exports) module.exports = preview;
  if (root) { root.ScheduleApp = root.ScheduleApp || {}; root.ScheduleApp.ImportPreview = preview; }
})(typeof window !== 'undefined' ? window : globalThis, function (domain, importer) {
  const fields = ['discipline', 'group', 'teachers', 'controlType', 'date', 'time', 'room', 'examForm'];
  const aliases = { discipline: /дисципл|предмет|subject|discipline/iu, group: /груп|group/iu, teachers: /виклада|преподав|teacher/iu,
    controlType: /контрол|control|тип.*ісп|форм.*контрол/iu, date: /дата|date/iu, time: /час|время|time/iu, room: /аудитор|кабінет|кабинет|room/iu, examForm: /форм.*ісп|exam.?form/iu };
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  function detect(rows) {
    let headerIndex = -1, score = 0, mapping = {};
    rows.slice(0, 8).forEach((row, index) => {
      const candidate = {};
      row.forEach((cell, column) => fields.forEach(field => { if (aliases[field].test(clean(cell)) && candidate[field] === undefined) candidate[field] = column; }));
      const count = Object.keys(candidate).length;
      if (count > score && count >= 2) { score = count; headerIndex = index; mapping = candidate; }
    });
    const defaults = { discipline: 1, group: 2, teachers: 3, controlType: 4, date: 5, time: 6, room: 7, examForm: -1 };
    return { headerIndex, mapping: headerIndex < 0 ? defaults : Object.fromEntries(fields.map(field => [field, mapping[field] ?? -1])), recognised: headerIndex >= 0 };
  }
  function build(tables, options = {}, existing = []) {
    const entries = [], signatures = new Set(existing.map(domain.normalizeItem).map(domain.contentKey));
    let emptyRows = 0, duplicates = 0, unrecognised = 0;
    tables.forEach((table, tableIndex) => {
      const config = table.config || detect(table.rows);
      table.rows.forEach((cells, rowIndex) => {
        if (rowIndex <= config.headerIndex) return;
        if (!cells.some(value => clean(value))) { emptyRows++; return; }
        const cell = field => config.mapping[field] >= 0 ? clean(cells[config.mapping[field]]) : '';
        const groupText = cell('group') || options.group || (/груп/iu.test(table.heading || '') ? (table.heading || '').replace(/^.*?груп[аиыу]?\s*[:.-]?\s*/iu, '') : '');
        const groups = groupText.split(/[;,]/).map(clean).filter(Boolean);
        const rawControl = cell('controlType');
        const controlType = importer.normalizeControlType(rawControl, options.controlType || 'залік');
        const row = domain.normalizeItem({ discipline: cell('discipline'), groups, groupHeading: groupText, teacher: cell('teachers'), controlType,
          date: cell('date'), time: cell('time'), room: cell('room'), examForm: cell('examForm'), studyForm: options.studyForm, term: options.term,
          eventId: groups.length > 1 ? `${options.sourceFile}|${tableIndex}|${rowIndex}` : '', sourceFile: options.sourceFile, sourceTable: tableIndex + 1 });
        const problems = domain.validate([row]).issues.map(issue => issue.message);
        if (rawControl && !/залік|зач[её]т|іспит|екзамен|экзамен|захист/iu.test(rawControl)) problems.push(`Тип контролю «${rawControl}» не розпізнано; застосовано ${controlType}`);
        const recognised = !!row.discipline && !!row.groups.length;
        if (!recognised) unrecognised++;
        const signature = domain.contentKey(row), duplicate = signatures.has(signature);
        if (duplicate) duplicates++; else signatures.add(signature);
        entries.push({ row, tableIndex, rowIndex, problems, duplicate, recognised, include: recognised });
      });
    });
    return { entries, emptyRows, duplicates, unrecognised };
  }
  return { fields, detect, build };
});
