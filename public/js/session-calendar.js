/** Calendar projection; editable cards remain views of the same draft rows. */
(function (root, factory) {
  const calendar = factory();
  if (typeof module === 'object' && module.exports) module.exports = calendar;
  if (root) { root.ScheduleApp = root.ScheduleApp || {}; root.ScheduleApp.SessionCalendar = calendar; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function monthDays(month) {
    const match = String(month).match(/^(\d{4})-(\d{2})$/);
    if (!match || +match[2] < 1 || +match[2] > 12) return [];
    const first = new Date(+match[1], +match[2] - 1, 1, 12);
    const start = new Date(first); start.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return { date: iso(date), inMonth: date.getMonth() === first.getMonth(), weekday: (date.getDay() + 6) % 7 }; });
  }
  function project(rows, month, group = '') {
    const filtered = rows.filter(row => !group || row.group === group);
    return { days: monthDays(month).map(day => ({ ...day, rows: filtered.filter(row => row.date === day.date).sort((a, b) => String(a.time).localeCompare(String(b.time))) })), unscheduled: filtered.filter(row => !row.date) };
  }
  return { monthDays, project };
});
