'use strict';
const crypto = require('crypto');
const domain = require('../js/session-domain');
const normalize = value => String(value || '').trim().toLowerCase();
const revision = session => crypto.createHash('sha256').update(JSON.stringify(session || null)).digest('hex');
function planPublication(store, payload, rules = {}) {
  const data = payload.data;
  const term = String(data.term || '').trim();
  if (!term) throw Object.assign(new Error('Вкажіть назву сесії'), { statusCode: 400 });
  const current = store.sessions.find(s => normalize(s.term) === normalize(term));
  const currentRevision = revision(current);
  if (payload.expectedRevision && payload.expectedRevision !== currentRevision) {
    throw Object.assign(new Error('Сесію змінив інший співробітник. Завантажте актуальну версію та повторіть перевірку.'), { statusCode: 409 });
  }
  const mode = payload.mode || 'upsert';
  if (!['upsert', 'replaceForm'].includes(mode)) throw Object.assign(new Error('Unknown publication mode'), { statusCode: 400 });
  if (mode === 'replaceForm' && !String(data.studyForm || '').trim()) throw Object.assign(new Error('Вкажіть форму навчання для заміни'), { statusCode: 400 });
  let incoming = data.items.map(it => domain.normalizeItem({ ...it, term, studyForm: it?.studyForm || data.studyForm || '' }));
  if (mode === 'upsert') incoming = [...new Map(incoming.map(it => [domain.contentKey(it), it])).values()];
  if (mode === 'replaceForm' && incoming.some(it => normalize(it.studyForm) !== normalize(data.studyForm))) {
    throw Object.assign(new Error('Чернетка містить іншу форму навчання'), { statusCode: 400 });
  }
  const before = (current?.items || []).map(domain.normalizeItem);
  let next;
  if (mode === 'replaceForm') next = before.filter(it => normalize(it.studyForm) !== normalize(data.studyForm)).concat(incoming);
  else {
    const incomingKeys = new Set(incoming.map(domain.identity));
    const frequencies = rows => rows.reduce((map, item) => { const id = domain.identity(item); map.set(id, (map.get(id) || 0) + 1); return map; }, new Map());
    const beforeCounts = frequencies(before), incomingCounts = frequencies(incoming);
    for (const id of incomingKeys) {
      if ((beforeCounts.get(id) || 0) > 1 || incomingCounts.get(id) > 1) {
        throw Object.assign(new Error('Імпорт неоднозначний: кілька подій однієї дисципліни для групи. Відкрийте сесію в конструкторі та перегляньте повну заміну форми.'), { statusCode: 422 });
      }
    }
    next = before.filter(it => !incomingKeys.has(domain.identity(it))).concat(incoming);
  }
  // Validate against other published sessions too: shared teachers and rooms are global resources.
  const others = store.sessions.filter(s => s !== current).flatMap(s => s.items || []).map(domain.normalizeItem);
  const validation = domain.validate(next.concat(others), rules);
  const relevantIssues = validation.issues.filter(issue => issue.indices.some(index => index < next.length));
  validation.issues = relevantIssues;
  validation.blockingCount = validation.blockingIndices.filter(index => index < next.length).length;
  const changes = domain.diff(before, next);
  return { term, mode, currentRevision, items: next, validation, changes,
    summary: { added: changes.added.length, changed: changes.changed.length, removed: changes.removed.length, count: next.length } };
}
module.exports = { planPublication, revision };
