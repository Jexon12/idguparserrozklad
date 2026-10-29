'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const domain = require('../js/session-domain');
const ROLES = ['methodist', 'publisher', 'admin'];
const SESSION_MS = 8 * 60 * 60 * 1000;
const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const id = () => crypto.randomUUID();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const safeUser = user => ({ id: user.id, username: user.username, name: user.name, role: user.role, disabled: !!user.disabled });
const emptyState = () => ({ version: 0, rulesVersion: 0, users: [], sessions: [], drafts: [], rules: domain.normalizeRules({}) });
const normalizeState = state => ({ ...emptyState(), ...state });
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex')}`;
}
async function checkPassword(password, stored) {
  const versioned = String(stored || '').startsWith('scrypt-v1:');
  const [salt, value] = String(stored || '').replace(/^scrypt-v1:/, '').split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(value || '')) return false;
  return crypto.timingSafeEqual(await scrypt(password, salt, 64, { N: versioned ? 32768 : 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }), Buffer.from(value, 'hex'));
}
function accountFields(payload) {
  const username = String(payload.username || '').trim().toLowerCase();
  const name = String(payload.name || '').trim();
  if (!/^[a-z0-9._@-]{3,80}$/.test(username) || !name || name.length > 120 || !ROLES.includes(payload.role)) fail(400, 'Вкажіть логін, ім’я та роль');
  return { username, name, role: payload.role };
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail(400, 'Пароль має містити від 12 до 256 символів');
}
function cookieToken(req) {
  const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim());
  return cookies.find(value => value.startsWith('schedule_staff='))?.slice('schedule_staff='.length) || '';
}
function sessionCookie(token, clear = false) {
  return `schedule_staff=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
const canRead = (user, draft) => user.role !== 'methodist' || draft.ownerId === user.id || draft.sharedWith.includes(user.id);
const canEdit = (user, draft) => user.role === 'admin' || draft.ownerId === user.id || draft.sharedWith.includes(user.id);
const draftMeta = draft => ({ id: draft.id, title: draft.title, term: draft.payload.fields?.sessionTerm || '', studyForm: draft.payload.fields?.studyForm || '', ownerId: draft.ownerId, sharedWith: draft.sharedWith, status: draft.status, version: draft.version, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, count: draft.payload.rows.length });
const publicationItems = payload => payload.rows.map(row => domain.normalizeItem({ ...row._source, ...row, groups: [row.group], groupHeading: row.group, teacher: (row.teachers || []).join('; '), term: payload.fields.sessionTerm || payload.fields.sessionTermSelect, studyForm: payload.fields.studyForm }));
function publicationDraft(state, user, payload) {
  const draft = state.drafts.find(d => d.id === payload.draftId);
  if (!draft || !canRead(user, draft)) fail(404, 'Чернетку не знайдено');
  if (draft.version !== payload.expectedDraftVersion) fail(409, 'Серверну чернетку змінив колега. Повторіть перегляд актуальної версії');
  const signature = rows => JSON.stringify(rows.map(row => JSON.stringify(domain.normalizeItem(row))).sort());
  const incoming = payload.data.items.map(row => ({ ...row, term: payload.data.term, studyForm: row.studyForm || payload.data.studyForm || '' }));
  if (signature(publicationItems(draft.payload)) !== signature(incoming) ||
      (draft.payload.fields.sessionTerm || draft.payload.fields.sessionTermSelect) !== payload.data.term) fail(409, 'Публікація не відповідає збереженій чернетці');
  return draft;
}
function validateDraftPayload(payload) {
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length > 10000 || !payload.fields || typeof payload.fields !== 'object') fail(400, 'Некоректна чернетка');
  if (Buffer.byteLength(JSON.stringify(payload)) > 1024 * 1024) fail(413, 'Чернетка перевищує 1 МБ');
  return JSON.parse(JSON.stringify(payload));
}
function createStaffService(repo, bootstrapPassword) {
  const read = async () => normalizeState(await repo.read());
  async function currentUser(req) {
    const token = cookieToken(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const state = await read();
    const session = state.sessions.find(s => s.tokenHash === hash(token) && s.expiresAt > Date.now());
    const user = session && state.users.find(u => u.id === session.userId && !u.disabled && (u.authVersion || 0) === session.authVersion);
    return user || null;
  }
  async function authorize(req, roles, legacyPassword) {
    const state = await read();
    const user = await currentUser(req);
    if (user && roles.includes(user.role)) return safeUser(user);
    // The shared password is a migration path only before the first personal account exists.
    if (!state.users.length && bootstrapPassword() && legacyPassword === bootstrapPassword()) return { id: 'legacy', name: 'Спільний адміністратор', role: 'admin' };
    fail(user ? 403 : 401, user ? 'Недостатньо прав для цієї дії' : 'Увійдіть у свій обліковий запис');
  }
  async function mutate(fn) {
    return repo.mutate(async raw => {
      const state = normalizeState(raw);
      const result = await fn(state);
      state.version++;
      Object.assign(raw, state);
      return result;
    });
  }
  async function login(req, res, payload, bootstrap = false) {
    const password = String(payload.password || '');
    if (password.length > 256) fail(400, 'Некоректний пароль');
    let newUser;
    if (bootstrap) {
      validatePassword(payload.password);
      const fields = accountFields({ ...payload, role: 'admin' });
      if (!bootstrapPassword() || payload.setupPassword !== bootstrapPassword()) fail(403, 'Невірний пароль первинного налаштування');
      newUser = { id: id(), ...fields, passwordHash: await passwordHash(password), authVersion: 0, disabled: false };
    }
    // Hashing is done outside the storage lock; identity is rechecked under it.
    const before = await read();
    const candidate = before.users.find(u => u.username === String(payload.username || '').trim().toLowerCase() && !u.disabled);
    const verified = candidate ? await checkPassword(password, candidate.passwordHash) : await checkPassword(password, '00000000000000000000000000000000:' + '0'.repeat(128));
    if (!bootstrap && (!candidate || !verified)) fail(401, 'Невірний логін або пароль');
    const token = crypto.randomBytes(32).toString('hex');
    const result = await mutate(state => {
      if (bootstrap) {
        if (state.users.length) fail(409, 'Первинне налаштування вже виконано');
        state.users.push(newUser);
      }
      const user = bootstrap ? newUser : state.users.find(u => u.id === candidate.id && !u.disabled && u.passwordHash === candidate.passwordHash);
      if (!user) fail(401, 'Обліковий запис змінився. Повторіть вхід');
      state.sessions = state.sessions.filter(s => s.expiresAt > Date.now()).slice(-499);
      state.sessions.push({ tokenHash: hash(token), userId: user.id, authVersion: user.authVersion || 0, expiresAt: Date.now() + SESSION_MS });
      return safeUser(user);
    });
    res.setHeader('Set-Cookie', sessionCookie(token));
    return { user: result };
  }
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.toLowerCase();
    if (!route.startsWith('/api/staff/')) return false;
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let auditWarning = '';
    const audit = async (...args) => { if (await repo.audit(...args) === false) auditWarning = 'Дію виконано, але записати її до журналу не вдалося. Повідомте адміністратора.'; };
    try {
      let result;
      if (route === '/api/staff/auth/me' && req.method === 'GET') {
        const state = await read(); const user = await currentUser(req);
        result = { user: user ? safeUser(user) : null, setupRequired: !state.users.length, storage: await repo.storage() };
      } else if (['/api/staff/auth/login', '/api/staff/auth/bootstrap'].includes(route) && req.method === 'POST') {
        result = await login(req, res, body, route.endsWith('bootstrap'));
      } else if (route === '/api/staff/auth/logout' && req.method === 'POST') {
        await mutate(state => { state.sessions = state.sessions.filter(s => s.tokenHash !== hash(cookieToken(req))); });
        res.setHeader('Set-Cookie', sessionCookie('', true)); result = { success: true };
      } else if (route === '/api/staff/auth/password' && req.method === 'POST') {
        const user = await currentUser(req);
        if (!user || !await checkPassword(String(body.currentPassword || '').slice(0, 256), user.passwordHash)) fail(401, 'Невірний поточний пароль');
        validatePassword(body.password); const secret = await passwordHash(body.password);
        result = await mutate(state => {
          const account = state.users.find(value => value.id === user.id && value.passwordHash === user.passwordHash && !value.disabled);
          if (!account) fail(409, 'Обліковий запис змінився');
          account.passwordHash = secret; account.authVersion++; state.sessions = state.sessions.filter(session => session.userId !== user.id);
          return { success: true };
        });
        res.setHeader('Set-Cookie', sessionCookie('', true));
        await audit(req, 'password-change', { userId: user.id, actor: user.name });
      } else if (route === '/api/staff/rules' && req.method === 'GET') {
        const state = await read(); result = { rules: state.rules, version: state.rulesVersion, stateVersion: state.version };
      } else if (route === '/api/staff/rules' && req.method === 'POST') {
        const user = await authorize(req, ['admin']);
        result = await mutate(state => {
          if (body.expectedVersion !== state.rulesVersion) fail(409, 'Налаштування змінилися. Оновіть сторінку');
          try { state.rules = domain.normalizeRules(body.rules); } catch (error) { fail(400, error.message); }
          state.rules.configured = true;
          state.rulesVersion++;
          return { rules: state.rules, version: state.rulesVersion };
        });
        await audit(req, 'rules-update', { userId: user.id, actor: user.name });
      } else if (route === '/api/staff/users') {
        const user = await authorize(req, req.method === 'GET' ? ROLES : ['admin']);
        if (req.method === 'GET') result = { users: (await read()).users.filter(u => !u.disabled || user.role === 'admin').map(safeUser) };
        else if (req.method === 'POST') {
          const fields = accountFields(body);
          let secret;
          if (body.password) { validatePassword(body.password); secret = await passwordHash(body.password); }
          result = await mutate(state => {
            const current = body.id && state.users.find(u => u.id === body.id);
            if (body.id && !current) fail(404, 'Обліковий запис не знайдено');
            if (!current && !secret) fail(400, 'Вкажіть пароль нового користувача');
            if (state.users.some(u => u.username === fields.username && u.id !== body.id)) fail(409, 'Логін уже використовується');
            if (current?.role === 'admin' && (fields.role !== 'admin' || body.disabled) && !state.users.some(u => u.id !== current.id && u.role === 'admin' && !u.disabled)) fail(409, 'Не можна вимкнути останнього адміністратора');
            const target = current || { id: id(), authVersion: 0 };
            Object.assign(target, fields, { disabled: !!body.disabled });
            if (secret) target.passwordHash = secret;
            target.authVersion++;
            if (!current) state.users.push(target);
            state.sessions = state.sessions.filter(s => s.userId !== target.id);
            return { user: safeUser(target) };
          });
          await audit(req, 'user-update', { userId: user.id, targetId: result.user.id, actor: user.name });
        } else fail(405, 'Метод не підтримується');
      } else if (route === '/api/staff/backup') {
        const user = await authorize(req, ['admin']);
        if (req.method === 'GET') {
          const state = await read();
          const data = { ...state, sessions: [] };
          result = { format: 'schedule-staff-backup-v1', createdAt: new Date().toISOString(), data, checksum: hash(JSON.stringify(data)), version: state.version };
        } else if (req.method === 'POST') {
          let backup = body.backup;
          if (body.compressedBackup) {
            try { backup = JSON.parse(zlib.gunzipSync(Buffer.from(body.compressedBackup, 'base64'), { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8')); }
            catch (_) { fail(400, 'Некоректна стиснена копія або розмір після розпакування перевищує 64 МБ'); }
          }
          if (backup?.format !== 'schedule-staff-backup-v1' || hash(JSON.stringify(backup.data)) !== backup.checksum) fail(400, 'Невірний формат або контрольна сума резервної копії');
          const recovered = normalizeState(backup.data);
          if (!Array.isArray(recovered.users) || !Array.isArray(recovered.drafts) || !recovered.users.some(u => u.id === user.id && u.role === 'admin' && !u.disabled)) fail(400, 'Копія має містити ваш активний обліковий запис адміністратора');
          recovered.users.forEach(u => { accountFields(u); if (!/^(?:scrypt-v1:)?[a-f0-9]{32}:[a-f0-9]{128}$/.test(u.passwordHash || '')) fail(400, 'Пошкоджені облікові записи'); });
          recovered.drafts.forEach(d => { validateDraftPayload(d.payload); if (!Array.isArray(d.sharedWith)) fail(400, 'Пошкоджена чернетка'); });
          const state = await read();
          if (body.expectedVersion !== state.version) fail(409, 'Стан змінився. Повторіть перегляд відновлення');
          if (body.preview === true) result = { version: state.version, users: recovered.users.length, drafts: recovered.drafts.length };
          else {
            result = await mutate(async current => {
              if (body.expectedVersion !== current.version) fail(409, 'Стан змінився. Повторіть перегляд відновлення');
              await repo.archive({ ...current, sessions: [] });
              const nextVersion = current.version, nextRulesVersion = current.rulesVersion + 1;
              Object.assign(current, recovered, { version: nextVersion, rulesVersion: nextRulesVersion, sessions: [], rules: domain.normalizeRules(recovered.rules) });
              return { success: true };
            });
            res.setHeader('Set-Cookie', sessionCookie('', true));
            await audit(req, 'staff-restore', { userId: user.id, actor: user.name });
          }
        } else fail(405, 'Метод не підтримується');
      } else if (route === '/api/staff/backup/previous' && req.method === 'GET') {
        await authorize(req, ['admin']); const data = await repo.previousArchive();
        result = { format: 'schedule-staff-backup-v1', data, checksum: data ? hash(JSON.stringify(data)) : '', version: (await read()).version, createdAt: new Date().toISOString() };
      } else if (route === '/api/staff/drafts' || route.startsWith('/api/staff/drafts/')) {
        const user = await authorize(req, ROLES);
        const draftId = route.split('/')[4];
        if (req.method === 'GET') {
          const state = await read();
          if (!draftId) result = { drafts: state.drafts.filter(d => canRead(user, d)).map(draftMeta) };
          else { const draft = state.drafts.find(d => d.id === draftId); if (!draft || !canRead(user, draft)) fail(404, 'Чернетку не знайдено'); result = { draft, canEdit: canEdit(user, draft) }; }
        } else if (req.method === 'POST') {
          const payload = validateDraftPayload(body.payload);
          result = await mutate(state => {
            const current = draftId && state.drafts.find(d => d.id === draftId);
            if (draftId && !current) fail(404, 'Чернетку не знайдено');
            if (current && !canEdit(user, current)) fail(403, 'Чернетка доступна лише для перегляду');
            if (current && body.expectedVersion !== current.version) fail(409, 'Чернетку змінив колега. Відкрийте серверну версію або збережіть вашу як нову копію');
            if (!current && state.drafts.filter(d => d.ownerId === user.id).length >= 50) fail(409, 'Досягнуто ліміт 50 чернеток');
            const sharedWith = Array.isArray(body.sharedWith) ? [...new Set(body.sharedWith)] : current?.sharedWith || [];
            if (current && current.ownerId !== user.id && user.role !== 'admin' && JSON.stringify(sharedWith.slice().sort()) !== JSON.stringify(current.sharedWith.slice().sort())) fail(403, 'Спільний доступ змінює власник чернетки або адміністратор');
            if (sharedWith.some(uid => !state.users.some(u => u.id === uid && !u.disabled))) fail(400, 'Оберіть активних колег');
            const status = body.status === 'ready' ? 'ready' : 'draft';
            if (status === 'ready') {
              const fields = payload.fields;
              const validation = domain.validate(publicationItems(payload), state.rules);
              if (!(fields.sessionTerm || fields.sessionTermSelect) || !fields.studyForm || validation.blockingCount) fail(422, 'Виправте проблеми й назву сесії перед передачею на публікацію');
            }
            const draft = current || { id: id(), ownerId: user.id, version: 0, snapshots: [] };
            if (current) draft.snapshots = [...(draft.snapshots || []), { version: draft.version, payload: draft.payload, at: draft.updatedAt, by: draft.updatedBy }].slice(-5);
            Object.assign(draft, { payload, title: String(body.title || payload.fields.sessionTerm || 'Чернетка').slice(0, 160), sharedWith, status, version: draft.version + 1, updatedAt: new Date().toISOString(), updatedBy: user.name });
            if (!current) state.drafts.push(draft);
            return { draft, canEdit: true };
          });
          await audit(req, 'draft-save', { userId: user.id, actor: user.name, draftId: result.draft.id, version: result.draft.version });
        } else if (req.method === 'DELETE' && draftId) {
          result = await mutate(state => {
            const draft = state.drafts.find(d => d.id === draftId);
            if (!draft || !canEdit(user, draft)) fail(404, 'Чернетку не знайдено');
            if (Number(url.searchParams.get('version')) !== draft.version) fail(409, 'Чернетка змінилася');
            state.drafts = state.drafts.filter(d => d.id !== draftId); return { success: true };
          });
          await audit(req, 'draft-delete', { userId: user.id, actor: user.name, draftId });
        } else fail(405, 'Метод не підтримується');
      } else fail(404, 'Маршрут не знайдено');
      res.status(200).json(auditWarning ? { ...result, warning: auditWarning } : result);
    } catch (error) { res.status(error.statusCode || 503).json({ error: error.message }); }
    return true;
  }
  return { handle, authorize, currentUser, rules: async () => (await read()).rules,
    checkDraft: async (req, payload) => publicationDraft(await read(), await authorize(req, ROLES), payload),
    withDraftPublication: async (req, payload, execute) => {
      const user = await authorize(req, ['publisher', 'admin']);
      return mutate(async state => {
        const account = state.users.find(value => value.id === user.id && !value.disabled && ['publisher', 'admin'].includes(value.role));
        const session = state.sessions.find(value => value.userId === user.id && value.tokenHash === hash(cookieToken(req)) && value.expiresAt > Date.now() && value.authVersion === account?.authVersion);
        if (!account || !session) fail(401, 'Сеанс змінився. Увійдіть знову');
        const draft = publicationDraft(state, user, payload);
        const result = await execute();
        if (result?.success) {
          draft.status = 'published'; draft.version++; draft.updatedAt = new Date().toISOString(); draft.updatedBy = user.name;
          draft.payload.publicationBaseline = { term: String(payload.data.term).toLowerCase(), revision: result.revision };
          draft.publishedRevision = result.revision; result.draftVersion = draft.version;
        }
        return result;
      });
    }
  };
}
module.exports = { createStaffService, passwordHash, checkPassword };
