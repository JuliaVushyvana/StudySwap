// Юніт-тести commentService: репозиторій і каталог замінено фейками в пам'яті, БД не потрібна.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommentService } = require('../../service/discussion/commentService');
const { createIdempotencyService } = require('../../service/idempotency/idempotencyService');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } = require('../../service/errors');
const { User, Role } = require('../../domain/access/User');
const { accessPolicy } = require('../../service/access/accessService');

const NOW = new Date('2026-11-23T09:30:00Z');
const born = new Date('2005-03-14');
const anna = Object.assign(new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash: 'x', birthDate: born }), { id: 1 });
const julia = Object.assign(new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash: 'x', birthDate: born }), { id: 2 });
const admin = Object.assign(new User({ nickname: 'Admin', login: 'admin1', email: 'admin@uni.ua', passwordHash: 'x', birthDate: born, role: Role.ADMIN }), { id: 3 });
const superadmin = Object.assign(new User({ nickname: 'Super Admin', login: 'superadmin', email: 'super@uni.ua', passwordHash: 'x', birthDate: born, role: Role.SUPERADMIN }), { id: 4 });

// Як і справжній репозиторій, повертає коментарі з полем materialId
function fakeCommentRepository() {
  const rows = new Map();
  let nextId = 1;
  return {
    findByMaterial: (materialId) => [...rows.values()].filter((c) => c.materialId === materialId),
    findById: (id) => rows.get(id) || null,
    delete: (id) => { rows.delete(id); },
    insert: (materialId, comment) => { const id = nextId++; rows.set(id, Object.assign(comment, { materialId })); return id; },
  };
}

function fakeIdempotencyRepository() {
  const rows = new Map();
  return {
    find: (userId, key) => rows.get(`${userId}:${key}`) || null,
    save: ({ userId, key, ...entry }) => { rows.set(`${userId}:${key}`, entry); },
  };
}

// Каталог з опублікованими матеріалами 100 (Anna) і 200 (Julia); решта id → 404, як у справжньому materialService
const fakeMaterialService = {
  get: (user, rawId) => {
    const material = { 100: { id: 100, authorId: anna.id }, 200: { id: 200, authorId: julia.id } }[String(rawId)];
    if (!material) throw new NotFoundError('MATERIAL_NOT_FOUND');
    return material;
  },
};

// Кожен виклик create у тестах — окрема операція з власним Idempotency-Key
let keyCounter = 0;
const key = () => `comment-key-${++keyCounter}`;

function setup({ userDirectory = null } = {}) {
  const idempotencyService = createIdempotencyService({ idempotencyRepository: fakeIdempotencyRepository(), now: () => NOW });
  return createCommentService({
    commentRepository: fakeCommentRepository(), materialService: fakeMaterialService,
    idempotencyService, accessPolicy, userDirectory, now: () => NOW,
  });
}

// Код першої помилки валідації
function validationCode(fn) {
  try { fn(); } catch (e) { assert.ok(e instanceof ValidationError, e.message); return e.code; }
  return assert.fail('очікувалась ValidationError');
}

test('create: коментар зареєстрованого → CommentResponse, текст без пробілів по краях', () => {
  const service = setup();

  const created = service.create(julia, '100', { text: '  Дякую, дуже допомогло!  ' }, key());

  assert.deepEqual(created, {
    id: 1, materialId: 100, authorId: 2, authorNickname: 'Julia',
    text: 'Дякую, дуже допомогло!', createdAt: '2026-11-23T09:30:00.000Z',
  });
});

test('list: усі, зокрема гість, бачать коментарі спочатку старіші; без коментарів — порожній список', () => {
  const service = setup();
  assert.deepEqual(service.list(null, '100'), { items: [], total: 0 });

  service.create(julia, '100', { text: 'Перший' }, key());
  service.create(anna, '100', { text: 'Другий' }, key());

  const { items, total } = service.list(null, '100');
  assert.equal(total, 2);
  assert.deepEqual(items.map((c) => c.text), ['Перший', 'Другий']);
});

test('create: гість → 401; порожній чи задовгий текст, не об\'єкт і зайві поля → 400', () => {
  const service = setup();

  assert.throws(() => service.create(null, '100', { text: 'Привіт' }, key()), UnauthorizedError);
  assert.equal(validationCode(() => service.create(anna, '100', { text: '   ' }, key())), 'TEXT_REQUIRED');
  assert.equal(validationCode(() => service.create(anna, '100', { text: 'x'.repeat(1001) }, key())), 'TEXT_TOO_LONG');
  assert.equal(validationCode(() => service.create(anna, '100', 'текст', key())), 'INVALID_BODY');
  assert.equal(validationCode(() => service.create(anna, '100', { text: 'ок', rating: 5 }, key())), 'UNKNOWN_FIELD');
  assert.equal(service.create(anna, '100', { text: 'x'.repeat(1000) }, key()).text.length, 1000);
});

test('create: повтор із тим самим Idempotency-Key не дублює коментар; без ключа → 400, ключ з іншим текстом → 409', () => {
  const service = setup();
  const k = key();

  const first = service.create(julia, '100', { text: 'Привіт' }, k);
  assert.deepEqual(service.create(julia, '100', { text: 'Привіт' }, k), first);
  assert.equal(service.list(null, '100').total, 1);

  assert.equal(validationCode(() => service.create(julia, '100', { text: 'Привіт' }, undefined)), 'IDEMPOTENCY_KEY_REQUIRED');
  assert.throws(() => service.create(julia, '100', { text: 'Інший текст' }, k), ConflictError);
});

test('неіснуючий або видалений матеріал → 404 MATERIAL_NOT_FOUND і для читання, і для запису', () => {
  const service = setup();

  assert.throws(() => service.list(null, '999'), { code: 'MATERIAL_NOT_FOUND' });
  assert.throws(() => service.create(anna, '999', { text: 'Привіт' }, key()), { code: 'MATERIAL_NOT_FOUND' });
});

test('автор коментаря показується з актуальним нікнеймом із модуля access', () => {
  const service = setup({ userDirectory: { nicknameOf: (id) => (id === 2 ? 'Julia V.' : null) } });

  service.create(julia, '100', { text: 'Привіт' }, key());

  assert.equal(service.list(null, '100').items[0].authorNickname, 'Julia V.');
});

test('remove: адмін і суперадмін видаляють будь-який коментар', () => {
  const service = setup();
  const first = service.create(julia, '100', { text: 'Перший' }, key());
  const second = service.create(anna, '100', { text: 'Другий' }, key());

  service.remove(admin, '100', String(first.id));
  service.remove(superadmin, '100', String(second.id));

  assert.deepEqual(service.list(null, '100'), { items: [], total: 0 });
});

test('remove: гість → 401, звичайний користувач (навіть автор коментаря чи матеріалу) → 403', () => {
  const service = setup();
  const comment = service.create(julia, '100', { text: 'Привіт' }, key());

  assert.throws(() => service.remove(null, '100', String(comment.id)), UnauthorizedError);
  assert.throws(() => service.remove(julia, '100', String(comment.id)), ForbiddenError);
  assert.throws(() => service.remove(anna, '100', String(comment.id)), ForbiddenError);
  assert.equal(service.list(null, '100').total, 1);
});

test('remove: неіснуючий коментар, коментар з іншого матеріалу чи некоректний id → 404 COMMENT_NOT_FOUND', () => {
  const service = setup();
  const comment = service.create(julia, '100', { text: 'Привіт' }, key());

  assert.throws(() => service.remove(admin, '100', '999'), { code: 'COMMENT_NOT_FOUND' });
  assert.throws(() => service.remove(admin, '200', String(comment.id)), { code: 'COMMENT_NOT_FOUND' });
  assert.throws(() => service.remove(admin, '100', 'abc'), { code: 'COMMENT_NOT_FOUND' });
  assert.throws(() => service.remove(admin, '999', String(comment.id)), { code: 'MATERIAL_NOT_FOUND' });
  assert.equal(service.list(null, '100').total, 1);
});
