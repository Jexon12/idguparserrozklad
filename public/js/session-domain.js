/** Session rules shared by the editor, worker and publication API. No IO. */
(function (root, factory) {
  const domain = factory();
  if (typeof module === 'object' && module.exports) module.exports = domain;
  if (root) { root.ScheduleApp = root.ScheduleApp || {}; root.ScheduleApp.SessionDomain = domain; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const clean = (v) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const key = (v) => clean(v).toLowerCase();
  const teacherKey = (v) => key(v).replace(/\./g, '').replace(/\s+/g, '');
  const dateIso = (v) => {
    let value = clean(v);
    const dmy = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy) value = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const d = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : '';
  };
  const timeMinutes = (v) => {
    const m = clean(v).match(/^(\d{1,2})[:.](\d{2})$/);
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  };
  const normalizeRules = (value = {}) => {
    const number = (name, max) => {
      const n = Number(value[name] || 0);
      if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`Некоректне правило: ${name}`);
      return n;
    };
    const start = clean(value.workdayStart), end = clean(value.workdayEnd);
    if ((start || end) && (timeMinutes(start) === null || timeMinutes(end) === null || timeMinutes(start) >= timeMinutes(end))) throw new Error('Вкажіть коректний початок і кінець робочого дня');
    return { configured: value.configured === true, examDurationMinutes: number('examDurationMinutes', 480),
      minExamGapDays: number('minExamGapDays', 30), maxGroupExamsPerDay: number('maxGroupExamsPerDay', 20),
      maxTeacherExamsPerDay: number('maxTeacherExamsPerDay', 100), workdayStart: start, workdayEnd: end,
      enforcePlanningRules: value.enforcePlanningRules === true };
  };
  const normalizeItem = (item = {}) => {
    item = item && typeof item === 'object' ? item : {};
    const rawTime = clean(item.time).replace(/[–—]/g, '-');
    const time = rawTime.split('-').map(v => {
      const minutes = timeMinutes(v);
      return minutes === null ? clean(v) : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }).join('-');
    const teacher = clean(item.teacher || (Array.isArray(item.teachers) ? item.teachers.join('; ') : ''));
    return {
      term: clean(item.term), studyForm: clean(item.studyForm), groupHeading: clean(item.groupHeading || item.group), eventId: clean(item.eventId),
      groups: Array.from(new Set((Array.isArray(item.groups) ? item.groups : item.group ? [item.group] : []).map(key).filter(Boolean))).sort(),
      controlType: key(item.controlType || 'залік'), discipline: clean(item.discipline),
      speciality: clean(item.speciality), program: clean(item.program), examForm: clean(item.examForm),
      teacher: Array.from(new Set(teacher.replace(/\s*(,|\/|\|)\s*/g, '; ').replace(/\s+та\s+/giu, '; ').split(';').map(clean).filter(Boolean))).join('; '),
      date: dateIso(item.date) || clean(item.date), time, room: clean(item.room),
      sourceTable: Number.isFinite(Number(item.sourceTable)) ? Number(item.sourceTable) : 0,
      sourceFile: clean(item.sourceFile).slice(0, 255)
    };
  };
  const identity = (it) => JSON.stringify([key(it.studyForm), it.groups.map(key).sort(), key(it.discipline), key(it.controlType), key(it.examForm)]);
  const contentKey = (it) => JSON.stringify([identity(it), teacherKey(it.teacher), it.date, it.time, key(it.room).replace(/\s/g, '')]);
  const validate = (source, suppliedRules = {}) => {
    const rules = normalizeRules(suppliedRules);
    const items = source.map(normalizeItem);
    const quality = { missingDate: 0, missingTime: 0, missingRoom: 0, missingTeacher: 0, missingGroup: 0, missingDiscipline: 0, invalidDate: 0, invalidTime: 0, unknownDuration: 0, duplicateRows: 0, teacherAliases: 0 };
    const issues = [], conflictRows = new Set(), slots = new Map(), duplicates = new Map(), aliases = new Map(), groupDays = new Map(), teacherDays = new Map();
    const blockingIndices = new Set(); let issueCount = 0, blockingCount = 0;
    const add = (type, index, message, severity = 'error', indices = [index]) => {
      issueCount++;
      if (severity === 'error') { blockingCount++; indices.forEach(value => blockingIndices.add(value)); }
      if (issues.length < 500) issues.push({ type, index, indices: indices.slice(0, 50), message, severity });
    };
    items.forEach((it, index) => {
      const exam = it.controlType === 'іспит';
      [['Date', !it.date, 'Вкажіть дату'], ['Time', exam && !it.time, 'Вкажіть час іспиту'], ['Room', exam && !it.room, 'Вкажіть аудиторію іспиту'],
        ['Teacher', !it.teacher, 'Вкажіть викладача'], ['Group', !it.groups.length, 'Вкажіть групу'], ['Discipline', !it.discipline, 'Вкажіть дисципліну']].forEach(([field, missing, message]) => {
        if (missing) { quality[`missing${field}`]++; add(`missing${field}`, index, message); }
      });
      if (it.date && !dateIso(it.date)) { quality.invalidDate++; add('invalidDate', index, 'Некоректна дата'); }
      const times = it.time.split('-').map(timeMinutes);
      if (exam && it.time && times.length === 1 && times[0] !== null && !rules.examDurationMinutes) quality.unknownDuration++;
      if (it.time && (times.length > 2 || times.some(t => t === null) || (times.length === 2 && times[1] <= times[0]))) {
        quality.invalidTime++; add('invalidTime', index, 'Час: ГГ:ХХ або ГГ:ХХ-ГГ:ХХ');
      }
      const duplicate = contentKey(it);
      if (duplicates.has(duplicate)) { quality.duplicateRows++; add('duplicate', index, 'Повторний запис', 'error', [duplicates.get(duplicate), index]); }
      else duplicates.set(duplicate, index);
      const teachers = it.teacher.split(';').map(clean).filter(Boolean);
      teachers.forEach(t => { const k = teacherKey(t); if (!aliases.has(k)) aliases.set(k, new Set()); aliases.get(k).add(t); });
      if (!dateIso(it.date) || !it.time || times.some(t => t === null)) return;
      const start = times[0], end = times.length === 2 ? times[1] : start + (exam && rules.examDurationMinutes || 1);
      const planningSeverity = rules.enforcePlanningRules ? 'error' : 'warning';
      if (exam && rules.workdayStart && (start < timeMinutes(rules.workdayStart) || end > timeMinutes(rules.workdayEnd))) add('outsideHours', index, 'Іспит виходить за налаштовані робочі години', planningSeverity);
      if (exam) {
        it.groups.forEach(group => { if (!groupDays.has(group)) groupDays.set(group, []); groupDays.get(group).push({ date: it.date, index }); });
        teachers.forEach(teacher => {
          const k = JSON.stringify([teacherKey(teacher), it.date]);
          if (!teacherDays.has(k)) teacherDays.set(k, new Map());
          const event = it.eventId ? JSON.stringify([it.eventId, key(it.term), key(it.discipline), it.time, key(it.room)]) : String(index);
          const events = teacherDays.get(k); if (!events.has(event)) events.set(event, []); events.get(event).push(index);
        });
      }
      const resources = [...it.groups.map(g => ['group', key(g)]), ...teachers.map(t => ['teacher', teacherKey(t)]), ...(it.room ? [['room', key(it.room).replace(/\s/g, '')]] : [])];
      resources.forEach(([type, value]) => {
        const resourceKey = JSON.stringify([type, it.date, value]);
        if (!slots.has(resourceKey)) slots.set(resourceKey, new Map());
        const eventKey = type !== 'group' && it.eventId
          ? JSON.stringify([it.eventId, key(it.term), key(it.discipline), it.controlType, teacherKey(it.teacher), it.date, it.time, key(it.room)])
          : String(index);
        const bucket = slots.get(resourceKey);
        if (!bucket.has(eventKey)) bucket.set(eventKey, { start, end, indices: [], type, value });
        bucket.get(eventKey).indices.push(index);
      });
    });
    // Sweep sorted intervals. A longest-running active interval is enough to mark every
    // participant; emitting every conflicting pair would be quadratic for bad imports.
    slots.forEach(bucket => {
      const events = [...bucket.values()].sort((a,b) => a.start - b.start || b.end - a.end);
      let active;
      const mark = event => {
        if (event.marked) return;
        event.marked = true;
        event.indices.forEach(index => { conflictRows.add(index); blockingIndices.add(index); });
      };
      events.forEach(event => {
        if (active && event.start < active.end) {
          mark(active); mark(event);
          const labels = { group: 'Група', teacher: 'Викладач', room: 'Аудиторія' };
          add('conflict-'+event.type, event.indices[0], labels[event.type]+' '+event.value+': заняття перетинаються', 'error', [...active.indices.slice(0,25), ...event.indices.slice(0,25)]);
        }
        if (!active || event.end > active.end) active = event;
      });
    });
    const severity = rules.enforcePlanningRules ? 'error' : 'warning';
    groupDays.forEach(events => {
      const byDay = new Map();
      events.forEach(event => { if (!byDay.has(event.date)) byDay.set(event.date, []); byDay.get(event.date).push(event.index); });
      byDay.forEach(indices => { if (rules.maxGroupExamsPerDay && indices.length > rules.maxGroupExamsPerDay) add('groupLoad', indices[0], 'Перевищено налаштовану кількість іспитів групи на день', severity, indices); });
      const dates = [...byDay.keys()].sort();
      for (let i = 1; i < dates.length; i++) {
        const gap = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
        if (rules.minExamGapDays && gap < rules.minExamGapDays) {
          const indices = [...byDay.get(dates[i - 1]), ...byDay.get(dates[i])];
          add('examGap', indices[0], `Між іспитами ${gap} днів; налаштований мінімум ${rules.minExamGapDays}`, severity, indices);
        }
      }
    });
    teacherDays.forEach(events => {
      if (rules.maxTeacherExamsPerDay && events.size > rules.maxTeacherExamsPerDay) {
        const indices = [...events.values()].flat(); add('teacherLoad', indices[0], 'Перевищено налаштоване навантаження викладача на день', severity, indices);
      }
    });
    aliases.forEach(a => { quality.teacherAliases += Math.max(0, a.size - 1); });
    return { quality, conflictsCount: conflictRows.size, conflictIndices: [...conflictRows], issues, blockingCount, blockingIndices: [...blockingIndices], truncatedIssues: Math.max(0, issueCount - issues.length) };
  };
  const diff = (before, after) => {
    const previous = before.map(normalizeItem), next = after.map(normalizeItem);
    const result = { added: [], removed: [], changed: [] };
    const exact = new Map(), used = new Set();
    previous.forEach((item, index) => { const id = contentKey(item); if (!exact.has(id)) exact.set(id, []); exact.get(id).push(index); });
    // Match unchanged rows first; multiple events for a subject must not disappear in a Map.
    const remaining = next.filter(item => {
      const bucket = exact.get(contentKey(item));
      if (!bucket?.length) return true;
      used.add(bucket.pop()); return false;
    });
    const byIdentity = new Map();
    previous.forEach((item, index) => { if (used.has(index)) return; const id = identity(item); if (!byIdentity.has(id)) byIdentity.set(id, []); byIdentity.get(id).push(index); });
    remaining.forEach(item => {
      const bucket = byIdentity.get(identity(item));
      if (!bucket?.length) result.added.push(item);
      else { const index = bucket.pop(); used.add(index); result.changed.push({ before: previous[index], after: item }); }
    });
    result.removed = previous.filter((_, index) => !used.has(index));
    return result;
  };
  return { normalizeItem, validate, diff, identity, contentKey, dateIso, normalizeRules, timeMinutes };
});
