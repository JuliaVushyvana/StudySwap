// Юніт-тести reportService: репозиторій, каталог і сповіщення замінено фейками в пам'яті, БД не потрібна.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createReportService, PAGE_SIZE } = require('../../service/moderation/reportService');
const { createIdempotencyService } = require('../../service/idempotency/idempotencyService');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } = require('../../service/errors');
const { User, Role } = require('../../domain/access/User');
const { accessPolicy } = require('../../service/access/accessService');
const { Report } = require('../../domain/moderation/Report');

const NOW = new Date('2026-11-23T10:00:00Z');
const born = new Date('2005-03-14');
const user = (id, nickname, login, role = Role.USER) => Object.assign(
  new User({ nickname, login, email: `${login}@uni.ua`, passwordHash: 'x', birthDate: born, role }), { id },
);
const anna = user(1, 'Anna', 'anna_k');
const julia = user(2, 'Julia', 'julia_v');
const admin = user(3, 'Admin', 'admin1', Role.ADMIN);
const superadmin = user(4, 'Super Admin', 'superadmin', Role.SUPERADMIN);

// Як справжній репозиторій: зберігає знімок і рішення, повертає нові екземпляри Report
// (рішення потрапляє в «БД» лише через saveDecision)
function fakeReportRepository() {
  const rows = new Map();
  let nextId = 1;
  const copy = (r) => Object.assign(new Report({
    id: r.id, materialId: r.materialId, materialAuthorId: r.materialAuthorId, reporterId: r.reporterId, text: r.text, createdAt: r.createdAt,
  }), r);
  const filtered = (status) => [...rows.values()].filter((r) => !status || r.status === status).sort((a, b) => b.id - a.id);
  return {
    findById: (id) => (rows.has(id) ? copy(rows.get(id)) : null),
    findPage: ({ status, limit, offset }) => filtered(status).slice(offset, offset + limit).map(copy),
    count: ({ status }) => filtered(status).length,
    insert: (r) => { const id = nextId++; rows.set(id, copy(Object.assign(r, { id }))); return id; },
    saveDecision: (r) => { rows.set(r.id, copy(r)); },
  };
}

function fakeIdempotencyRepository() {
  const rows = new Map();
  return {
    find: (userId, key) => rows.get(`${userId}:${key}`) || null,
    save: ({ userId, key, ...entry }) => { rows.set(`${userId}:${key}`, entry); },
  };
}

// Каталог: матеріал 100 від Anna; remove записує видалення і після нього матеріалу вже немає
function fakeMaterialService() {
  const materials = new Map([[100, { id: 100, title: 'Нормалізація БД', authorId: anna.id, authorNickname: 'Anna' }]]);
  return {
    removed: [],
    get: (u, rawId) => {
      const m = materials.get(Number(rawId));
      if (!m) throw new NotFoundError('MATERIAL_NOT_FOUND');
      return m;
    },
    remove(u, rawId) {
      if (!materials.delete(Number(rawId))) throw new NotFoundError('MATERIAL_NOT_FOUND');
      this.removed.push(Number(rawId));
    },
  };
}

function fakeNotifier({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    Kind: { REPORT_RESULT: 'report_result' },
    notify: (n) => { if (fail) throw new Error('БД сповіщень недоступна'); sent.push(n); },
  };
}

let keyCounter = 0;
const key = () => `report-key-${++keyCounter}`;

function setup({ notifier = fakeNotifier() } = {}) {
  const materialService = fakeMaterialService();
  const idempotencyService = createIdempotencyService({ idempotencyRepository: fakeIdempotencyRepository(), now: () => NOW });
  const service = createReportService({
    reportRepository: fakeReportRepository(), materialService, idempotencyService, accessPolicy,
    notifier, now: () => NOW, logger: { warn: () => {} },
  });
  return { service, materialService, notifier };
}

const complaint = (text = 'Це чужа курсова, видана за власний конспект') => ({ materialId: 100, text });

function validationCode(fn) {
  try { fn(); } catch (e) { assert.ok(e instanceof ValidationError, e.message); return e.code; }
  return assert.fail('очікувалась ValidationError');
}

test('create: скарга зареєстрованого → ReportResponse зі знімком матеріалу й автора', () => {
  const { service } = setup();

  const report = service.create(julia, complaint('  Це чужа курсова  '), key());

  assert.deepEqual(report, {
    id: 1, materialId: 100, materialTitle: 'Нормалізація БД', materialAuthorId: 1, materialAuthorNickname: 'Anna',
    reporterId: 2, reporterNickname: 'Julia', text: 'Це чужа курсова', status: 'open', decision: null,
    createdAt: '2026-11-23T10:00:00.000Z',
  });
});

test('create: гість → 401; порожній чи задовгий текст, без materialId, зайві поля → 400; неіснуючий матеріал → 404', () => {
  const { service } = setup();

  assert.throws(() => service.create(null, complaint(), key()), UnauthorizedError);
  assert.equal(validationCode(() => service.create(julia, complaint('   '), key())), 'TEXT_REQUIRED');
  assert.equal(validationCode(() => service.create(julia, complaint('x'.repeat(1001)), key())), 'TEXT_TOO_LONG');
  assert.equal(validationCode(() => service.create(julia, { text: 'спам' }, key())), 'MATERIAL_REQUIRED');
  assert.equal(validationCode(() => service.create(julia, { materialId: '100', text: 'спам' }, key())), 'MATERIAL_REQUIRED');
  assert.equal(validationCode(() => service.create(julia, { ...complaint(), urgent: true }, key())), 'UNKNOWN_FIELD');
  assert.throws(() => service.create(julia, { materialId: 999, text: 'спам' }, key()), { code: 'MATERIAL_NOT_FOUND' });
});

test('create: повтор із тим самим Idempotency-Key не дублює скаргу', () => {
  const { service } = setup();
  const k = key();

  const first = service.create(julia, complaint(), k);
  assert.deepEqual(service.create(julia, complaint(), k), first);
  assert.equal(service.list(admin, {}).total, 1);
});

test('list: лише адмін і суперадмін; гість → 401, користувач → 403; фільтр за статусом і пагінація', () => {
  const { service } = setup();
  for (let i = 0; i < PAGE_SIZE + 2; i++) service.create(julia, complaint(`Скарга ${i}`), key());
  service.decide(admin, '1', { result: 'rejected' });

  assert.throws(() => service.list(null, {}), UnauthorizedError);
  assert.throws(() => service.list(julia, {}), ForbiddenError);

  const firstPage = service.list(superadmin, {});
  assert.equal(firstPage.total, PAGE_SIZE + 2);
  assert.equal(firstPage.items.length, PAGE_SIZE);
  assert.equal(firstPage.items[0].text, `Скарга ${PAGE_SIZE + 1}`); // спочатку нові
  assert.equal(service.list(admin, { page: '2' }).items.length, 2);
  assert.equal(service.list(admin, { status: 'open' }).total, PAGE_SIZE + 1);
  assert.deepEqual(service.list(admin, { status: 'rejected' }).items.map((r) => r.id), [1]);
  assert.equal(validationCode(() => service.list(admin, { status: 'deleted' })), 'INVALID_STATUS');
  assert.equal(validationCode(() => service.list(admin, { page: '0' })), 'INVALID_PAGE');
});

test('decide: задовольнити з видаленням матеріалу → матеріал видалено, автор скарги отримує сповіщення без посилання', () => {
  const { service, materialService, notifier } = setup();
  service.create(julia, complaint(), key());

  const report = service.decide(admin, '1', { result: 'resolved', deleteMaterial: true, comment: 'Порушує правила' });

  assert.equal(report.status, 'resolved');
  assert.deepEqual(report.decision, { deleteMaterial: true, comment: 'Порушує правила', reviewerId: 3, reviewedAt: '2026-11-23T10:00:00.000Z' });
  assert.deepEqual(materialService.removed, [100]);
  assert.deepEqual(notifier.sent, [{
    recipientId: julia.id, kind: 'report_result', link: null,
    message: 'Вашу скаргу на «Нормалізація БД» задоволено: матеріал видалено. Коментар адміна: Порушує правила',
  }]);
  assert.equal(service.list(admin, { status: 'resolved' }).total, 1);
});

test('decide: відхилити → матеріал лишається, сповіщення з посиланням на матеріал', () => {
  const { service, materialService, notifier } = setup();
  service.create(julia, complaint(), key());

  const report = service.decide(admin, '1', { result: 'rejected' });

  assert.equal(report.status, 'rejected');
  assert.equal(report.decision.deleteMaterial, false);
  assert.deepEqual(materialService.removed, []);
  assert.equal(notifier.sent[0].message, 'Вашу скаргу на «Нормалізація БД» відхилено: порушень не знайдено.');
  assert.equal(notifier.sent[0].link, '/materials/100');
});

test('decide: повторний розгляд → 409; неіснуюча скарга → 404; користувач → 403; некоректне рішення → 400', () => {
  const { service } = setup();
  service.create(julia, complaint(), key());

  assert.throws(() => service.decide(julia, '1', { result: 'rejected' }), ForbiddenError);
  assert.throws(() => service.decide(null, '1', { result: 'rejected' }), UnauthorizedError);
  assert.equal(validationCode(() => service.decide(admin, '1', { result: 'approve' })), 'INVALID_RESULT');
  assert.equal(validationCode(() => service.decide(admin, '1', { result: 'rejected', deleteMaterial: true })), 'INVALID_DELETE_MATERIAL');
  assert.equal(validationCode(() => service.decide(admin, '1', { result: 'resolved', comment: 'x'.repeat(501) })), 'COMMENT_TOO_LONG');
  assert.throws(() => service.decide(admin, '99', { result: 'rejected' }), { code: 'REPORT_NOT_FOUND' });

  service.decide(admin, '1', { result: 'resolved' });
  assert.throws(() => service.decide(superadmin, '1', { result: 'rejected' }), ConflictError);
});

test('decide: матеріал уже видалено — скаргу однаково можна задовольнити; збій сповіщення не ламає рішення', () => {
  const { service, materialService } = setup({ notifier: fakeNotifier({ fail: true }) });
  service.create(julia, complaint(), key());
  service.create(anna, complaint('Дубль скарги'), key());

  service.decide(admin, '1', { result: 'resolved', deleteMaterial: true });
  const second = service.decide(admin, '2', { result: 'resolved', deleteMaterial: true });

  assert.equal(second.status, 'resolved');
  assert.deepEqual(materialService.removed, [100]);
});
