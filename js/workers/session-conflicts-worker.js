self.onmessage = function (e) {
  const { rows, mode } = e.data || {};
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const idxSet = new Set();
  const byGroupSlot = new Map();
  const byTeacherSlot = new Map();
  const byRoomSlot = new Map();
  const byGroupExamDay = new Map();
  const teachersNormMap = new Map();
  let missingDate = 0, missingTime = 0, missingRoom = 0, missingTeacher = 0;

  const teacherNormalize = (t) => clean(t).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');

  (rows || []).forEach((r, idx) => {
    const date = clean(r.date);
    const time = clean(r.time);
    const room = clean(r.room).replace(/\s+/g, '').toLowerCase();
    const group = clean(r.group).toLowerCase();
    const isExam = clean(r.controlType).toLowerCase() === 'іспит';
    const teachers = Array.isArray(r.teachers) ? r.teachers : [];

    if (!date) missingDate++;
    if (isExam && !time) missingTime++;
    if (isExam && !room) missingRoom++;
    if (!teachers.length) missingTeacher++;

    teachers.forEach((t) => {
      const key = teacherNormalize(t);
      if (!teachersNormMap.has(key)) teachersNormMap.set(key, new Set());
      teachersNormMap.get(key).add(clean(t));
    });

    if (!isExam || !date) return;

    if (time) {
      const gk = `${group}__${date}__${time}`;
      if (!byGroupSlot.has(gk)) byGroupSlot.set(gk, []);
      byGroupSlot.get(gk).push(idx);

      teachers.forEach((t) => {
        const tk = `${teacherNormalize(t)}__${date}__${time}`;
        if (!byTeacherSlot.has(tk)) byTeacherSlot.set(tk, []);
        byTeacherSlot.get(tk).push(idx);
      });

      if (room) {
        const rk = `${room}__${date}__${time}`;
        if (!byRoomSlot.has(rk)) byRoomSlot.set(rk, []);
        byRoomSlot.get(rk).push(idx);
      }
    }

    if (!byGroupExamDay.has(group)) byGroupExamDay.set(group, []);
    byGroupExamDay.get(group).push({ idx, date });
  });

  [byGroupSlot, byTeacherSlot, byRoomSlot].forEach((m) => m.forEach((arr) => { if (arr.length > 1) arr.forEach((i) => idxSet.add(i)); }));

  if (mode === 'strict') {
    byGroupExamDay.forEach((arr) => {
      const parsed = arr.map((x) => ({ ...x, ts: new Date(`${x.date}T00:00:00`).getTime() })).filter((x) => !Number.isNaN(x.ts)).sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < parsed.length; i++) {
        const daysDiff = Math.round((parsed[i].ts - parsed[i - 1].ts) / (24 * 3600 * 1000));
        if (daysDiff <= 1) {
          idxSet.add(parsed[i - 1].idx);
          idxSet.add(parsed[i].idx);
        }
      }
    });
  }

  let teacherAliases = 0;
  teachersNormMap.forEach((set) => { if (set.size > 1) teacherAliases += (set.size - 1); });

  const dups = new Map();
  (rows || []).forEach((r) => {
    const k = `${clean(r.discipline).toLowerCase()}__${clean(r.group).toLowerCase()}__${clean(r.controlType).toLowerCase()}`;
    dups.set(k, (dups.get(k) || 0) + 1);
  });
  let duplicateRows = 0;
  dups.forEach((n) => { if (n > 1) duplicateRows += (n - 1); });

  self.postMessage({
    conflictIndices: Array.from(idxSet),
    quality: { missingDate, missingTime, missingRoom, missingTeacher, teacherAliases, duplicateRows }
  });
};
