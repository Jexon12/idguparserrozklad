(function () {
  const SA = window.ScheduleApp, model = SA.ImportPreview;
  const panel = document.getElementById('importPreviewPanel');
  const labels = { discipline: 'Дисципліна', group: 'Група', teachers: 'Викладачі', controlType: 'Тип контролю', date: 'Дата', time: 'Час', room: 'Аудиторія', examForm: 'Форма іспиту' };
  let tables = [], sourceFile = '', currentTable = 0, preview;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function renderMapping() {
    const table = tables[currentTable]; if (!table) return;
    const host = document.getElementById('importColumnMapping'); host.replaceChildren();
    const maxColumns = Math.max(...table.rows.map(row => row.length), 1);
    model.fields.forEach(field => {
      const label = document.createElement('label'); label.textContent = labels[field];
      const select = document.createElement('select'); select.className = 'ui-select block w-full dark:bg-gray-700'; select.dataset.importField = field;
      select.add(new Option('Немає колонки / значення нижче', '-1'));
      for (let i = 0; i < maxColumns; i++) select.add(new Option(`${i + 1}. ${table.rows[table.config.headerIndex]?.[i] || 'Колонка ' + (i + 1)}`, String(i)));
      select.value = String(table.config.mapping[field]); select.onchange = () => { table.config.mapping[field] = Number(select.value); renderPreview(); };
      label.append(select); host.append(label);
    });
    document.getElementById('importHeaderRow').value = table.config.headerIndex + 1;
  }
  function renderPreview() {
    document.getElementById('importReviewed').checked = false; document.getElementById('applyImport').disabled = true;
    const draft = SA.SessionEditor.getDraft();
    preview = model.build(tables, { sourceFile, term: draft.fields.sessionTerm || draft.fields.sessionTermSelect, studyForm: draft.fields.studyForm,
      group: document.getElementById('importDefaultGroup').value, controlType: document.getElementById('importDefaultControl').value }, draft.rows.map(row => ({ ...row, groups: [row.group] })));
    document.getElementById('importSummary').textContent = `${sourceFile}: рядків ${preview.entries.length}, нерозпізнаних ${preview.unrecognised}, точних дублікатів ${preview.duplicates}, порожніх ${preview.emptyRows}. Перевірте колонки кожної таблиці.`;
    const rows = preview.entries.map((entry, index) => `<tr class="border-b dark:border-gray-700"><td class="p-2"><input type="checkbox" data-import-include="${index}" ${entry.include ? 'checked' : ''} aria-label="Включити рядок ${entry.rowIndex + 1}"></td><td class="p-2">${entry.tableIndex + 1}:${entry.rowIndex + 1}</td><td class="p-2">${escape(entry.row.discipline)}</td><td class="p-2">${escape(entry.row.groups.join(', '))}</td><td class="p-2">${escape(entry.row.teacher)}</td><td class="p-2">${escape(entry.row.controlType)}</td><td class="p-2">${escape(entry.row.date)} ${escape(entry.row.time)}</td><td class="p-2">${escape(entry.row.room)}</td><td class="p-2 text-amber-700 dark:text-amber-300">${escape([...(entry.duplicate ? ['Точний дублікат'] : []), ...entry.problems].join('; '))}</td></tr>`);
    document.getElementById('importRows').innerHTML = rows.join('');
    const table = tables[currentTable];
    document.getElementById('importRawRows').textContent = table.rows.slice(0, 8).map((row, index) => `${index + 1}: ${row.join(' | ')}`).join('\n');
  }
  SA.SessionImportUI = {
    clear() { tables = []; sourceFile = ''; preview = null; panel.classList.add('hidden'); document.getElementById('importRows').replaceChildren(); document.getElementById('importRawRows').textContent = ''; document.getElementById('docxFiles').value = ''; },
    stage(inputTables, name) {
      tables = inputTables.filter(table => table.rows.length).map(table => ({ ...table, config: model.detect(table.rows) }));
      if (!tables.length) throw new Error('У файлі немає таблиць');
      sourceFile = name; currentTable = 0;
      const select = document.getElementById('importTableSelect'); select.replaceChildren(); tables.forEach((table, index) => select.add(new Option(table.name || `Таблиця ${index + 1}`, String(index))));
      panel.classList.remove('hidden'); renderMapping(); renderPreview(); panel.scrollIntoView({ behavior: 'smooth' });
    }
  };
  document.getElementById('importTableSelect').onchange = event => { currentTable = Number(event.target.value); renderMapping(); renderPreview(); };
  document.getElementById('importHeaderRow').onchange = event => { tables[currentTable].config.headerIndex = Math.max(-1, Number(event.target.value) - 1); renderPreview(); };
  for (const id of ['importDefaultGroup', 'importDefaultControl']) document.getElementById(id).onchange = renderPreview;
  document.getElementById('importRows').onchange = event => { const input = event.target.closest('[data-import-include]'); if (input) preview.entries[Number(input.dataset.importInclude)].include = input.checked; };
  document.getElementById('importReviewed').onchange = event => { document.getElementById('applyImport').disabled = !event.target.checked; };
  document.getElementById('cancelImport').onclick = () => { panel.classList.add('hidden'); document.getElementById('docxFiles').value = ''; };
  document.getElementById('applyImport').onclick = () => {
    if (!preview || !document.getElementById('importReviewed').checked) return;
    const selected = preview.entries.filter(entry => entry.include && !(entry.duplicate && document.getElementById('skipImportDuplicates').checked));
    if (!selected.length) { document.getElementById('importSummary').textContent = 'Оберіть рядки для додавання'; return; }
    const payload = SA.SessionEditor.getDraft();
    const rows = selected.flatMap(entry => (entry.row.groups.length ? entry.row.groups : ['']).map(group => ({ _source: entry.row, id: crypto.randomUUID(), group,
      discipline: entry.row.discipline, teachers: entry.row.teacher.split(';').map(value => value.trim()).filter(Boolean), controlType: entry.row.controlType, date: entry.row.date, time: entry.row.time, room: entry.row.room })));
    payload.rows = payload.rows.concat(rows); SA.SessionEditor.applyDraft(payload); panel.classList.add('hidden');
    document.getElementById('docxFiles').value = ''; document.getElementById('step-edit').scrollIntoView({ behavior: 'smooth' });
  };
})();
