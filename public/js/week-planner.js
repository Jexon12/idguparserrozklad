/** Conservative simulation: move a lesson earlier only when every resource is free. */
(function (root, factory) {
  const planner = factory();
  if (typeof module === 'object' && module.exports) module.exports = planner;
  if (root) { root.ScheduleApp = root.ScheduleApp || {}; root.ScheduleApp.WeekPlanner = planner; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const normalized = v => String(v || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const teachers = row => String(row.teacher || '').split(/[;,]/).map(normalized).filter(Boolean);
  const resources = row => [`group:${normalized(row.group)}`, ...teachers(row).map(t => `teacher:${t}`), `room:${normalized(row.room)}`];
  const slot = (row, pair, resource) => JSON.stringify([row.date, pair, resource]);
  function simulate(rows, externalBusy = {}, times = {}) {
    const result = rows.map(row => ({ ...row }));
    const busy = new Map();
    const change = (row, delta) => resources(row).forEach(resource => {
      const k = slot(row, row.pair, resource); busy.set(k, (busy.get(k) || 0) + delta);
    });
    result.forEach(row => change(row, 1));
    result.sort((a, b) => String(a.group).localeCompare(String(b.group)) || String(a.date).localeCompare(String(b.date)) || a.pair - b.pair);
    let unverified = 0;
    result.forEach(row => {
      const teacherNames = teachers(row);
      if (!row.group || !row.room || !row.date || !teacherNames.length || teacherNames.some(t => !externalBusy[t])) { unverified++; return; }
      // Shared events and existing overlaps remain in their original slot for manual review.
      if (resources(row).some(resource => busy.get(slot(row, row.pair, resource)) > 1)) return;
      for (let pair = 1; pair < row.pair; pair++) {
        if (!times[pair]?.start || !times[pair]?.end) continue;
        if (resources(row).some(resource => busy.get(slot(row, pair, resource)) > 0)) continue;
        if (teacherNames.some(t => externalBusy[t].has(`${row.date}||${pair}`))) continue;
        change(row, -1);
        row.pair = pair; row.start = times[pair].start; row.end = times[pair].end;
        change(row, 1); break;
      }
    });
    return { rows: result, unverified };
  }
  return { simulate, teacherKey: normalized };
});
