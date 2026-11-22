// Юніт-тести materialService: репозиторій і сховище замінено фейками в пам'яті, БД не потрібна.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMaterialService } = require('../../service/catalog/materialService');
const { createIdempotencyService } = require('../../service/idempotency/idempotencyService');
const { ValidationError, ForbiddenError, NotFoundError, UnauthorizedError, ServiceUnavailableError } = require('../../service/errors');
const { User, Role } = require('../../domain/access/User');
const { accessPolicy } = require('../../service/access/accessService');

const NOW = new Date('2026-11-20T10:15:00Z');
const born = new Date('2005-03-14');
const anna = Object.assign(new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash: 'x', birthDate: born }), { id: 1 });
const julia = Object.assign(new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash: 'x', birthDate: born }), { id: 2 });
const admin = Object.assign(new User({ nickname: 'Admin', login: 'admin1', email: 'admin@uni.ua', passwordHash: 'x', birthDate: born, role: Role.ADMIN }), { id: 3 });

function fakeMaterialRepository() {
  const rows = new Map();
  let nextId = 100;
  return {
    findById: (id) => rows.get(id) || null,
    findPublished: () => [...rows.values()].filter((m) => m.isPublished()),
    insert: (m) => { const id = nextId++; rows.set(id, m); return id; },
    update: (m) => { rows.set(m.id, m); },
  };
}

const fakeStorageService = {
  getFile: (id) => ({
    'f-8c1e2b': { id: 'f-8c1e2b', fileName: 'normalization.pdf', sizeBytes: 2097152, url: '/files/f-8c1e2b' },
    'f-huge': { id: 'f-huge', fileName: 'lecture.mp4', sizeBytes: 500 * 1024 * 1024, url: '/files/f-huge' },
  }[id] || null),
};

function fakeIdempotencyRepository() {
  const rows = new Map();
  return {
    find: (userId, key) => rows.get(`${userId}:${key}`) || null,
    save: ({ userId, key, ...entry }) => { rows.set(`${userId}:${key}`, entry); },
  };
}

// Кожен виклик create у тестах — окрема операція з власним Idempotency-Key
let keyCounter = 0;
const key = () => `key-${++keyCounter}`;

const silentLogger = { warn: () => {} };

const validBody = () => ({
  title: 'Нормалізація БД', description: '1НФ–3НФ з прикладами', subject: 'Бази даних',
  university: 'КПІ', course: 2, type: 'конспект', fileId: 'f-8c1e2b',
});

function setup({ materialRepository = fakeMaterialRepository(), now = () => NOW } = {}) {
  const idempotencyService = createIdempotencyService({ idempotencyRepository: fakeIdempotencyRepository(), now });
  return createMaterialService({ materialRepository, storageService: fakeStorageService, idempotencyService, accessPolicy, now, logger: silentLogger });
}

test('create: коректні дані → матеріал за схемою MaterialResponse', () => {
  const service = setup();

  const created = service.create(anna, validBody(), key());

  assert.deepEqual(created, {
    id: 100,
    title: 'Нормалізація БД',
    description: '1НФ–3НФ з прикладами',
    subject: 'Бази даних',
    university: 'КПІ',
    course: 2,
    type: 'конспект',
    file: { fileName: 'normalization.pdf', format: 'pdf', sizeBytes: 2097152, url: '/files/f-8c1e2b' },
    authorId: 1,
    authorNickname: 'Anna',
    createdAt: '2026-11-20T10:15:00.000Z',
    updatedAt: '2026-11-20T10:15:00.000Z',
  });
  assert.deepEqual(service.get(anna, 100), created);
});

test('create: без title → ValidationError TITLE_REQUIRED', () => {
  const service = setup();
  const { title, ...withoutTitle } = validBody();

  assert.throws(() => service.create(anna, withoutTitle, key()), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.code, 'TITLE_REQUIRED');
    assert.deepEqual(err.details, [{ field: 'title', message: 'Назва обов\'язкова' }]);
    return true;
  });
  assert.equal(service.list({}).total, 0);
});

test('create: файл поза лімітами → ValidationError INVALID_FILE', () => {
  const service = setup();
  assert.throws(() => service.create(anna, { ...validBody(), fileId: 'f-huge' }, key()), { code: 'INVALID_FILE' });
});

test('create: без користувача → UnauthorizedError', () => {
  const service = setup();
  assert.throws(() => service.create(null, validBody(), key()), UnauthorizedError);
});

test('update: автор змінює поля, updatedAt оновлюється', () => {
  let now = NOW;
  const service = setup({ now: () => now });
  const { id } = service.create(anna, validBody(), key());
  now = new Date('2026-11-20T11:20:00Z');

  const updated = service.update(anna, String(id), { title: 'Нормалізація БД (оновлено)', course: 3 });

  assert.equal(updated.title, 'Нормалізація БД (оновлено)');
  assert.equal(updated.course, 3);
  assert.equal(updated.updatedAt, '2026-11-20T11:20:00.000Z');
});

test('update: чужий матеріал → ForbiddenError, порожнє тіло → EMPTY_UPDATE', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  assert.throws(() => service.update(julia, id, { title: 'Моє' }), ForbiddenError);
  assert.throws(() => service.update(anna, id, {}), { code: 'EMPTY_UPDATE' });
  assert.throws(() => service.update(anna, id, { authorId: 2 }), { code: 'UNKNOWN_FIELD' });
});

test('update: автор замінює файл на інший завантажений; неіснуючий fileId → FILE_REQUIRED', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  const updated = service.update(anna, id, { fileId: 'f-8c1e2b', title: 'Нова версія' });
  assert.equal(updated.title, 'Нова версія');
  assert.equal(updated.file.fileName, 'normalization.pdf');
  assert.throws(() => service.update(anna, id, { fileId: 'nope' }), { code: 'FILE_REQUIRED' });
  assert.throws(() => service.update(julia, id, { fileId: 'f-8c1e2b' }), ForbiddenError);
});

test('remove: адмін видаляє чужий матеріал, після цього він 404', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  service.remove(admin, id);

  assert.throws(() => service.get(anna, id), NotFoundError);
  assert.throws(() => service.remove(admin, id), NotFoundError);
});

test('list: пошук, фільтр і некоректний параметр', () => {
  const service = setup();
  service.create(anna, validBody(), key());
  service.create(julia, { ...validBody(), title: 'Принципи ООП', subject: 'ООП', course: 1 }, key());

  assert.deepEqual(service.list({ q: 'нормалізація', course: '2' }).items.map((m) => m.title), ['Нормалізація БД']);
  assert.equal(service.list({ sort: 'title' }).total, 2);
  assert.throws(() => service.list({ course: '9' }), { code: 'COURSE_OUT_OF_RANGE' });
});

test('create: повтор із тим самим Idempotency-Key → той самий матеріал без дубліката', () => {
  const service = setup();
  const idemKey = key();

  const first = service.create(anna, validBody(), idemKey);
  const retry = service.create(anna, validBody(), idemKey);

  assert.deepEqual(retry, first);
  assert.equal(service.list({}).total, 1);
});

test('create: без Idempotency-Key → ValidationError IDEMPOTENCY_KEY_REQUIRED', () => {
  const service = setup();
  assert.throws(() => service.create(anna, validBody(), undefined), { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  assert.equal(service.list({}).total, 0);
});

test('list: БД недоступна → degraded mode з останньої копії каталогу', () => {
  const materialRepository = fakeMaterialRepository();
  const service = setup({ materialRepository });
  service.create(anna, validBody(), key());
  assert.equal(service.list({}).degraded, false);

  materialRepository.findPublished = () => { throw new Error('SQLITE_IOERR'); };

  const degraded = service.list({ q: 'нормалізація' });
  assert.equal(degraded.degraded, true);
  assert.deepEqual(degraded.items.map((m) => m.title), ['Нормалізація БД']);
});

test('list: БД недоступна і копії ще немає → ServiceUnavailableError CATALOG_UNAVAILABLE', () => {
  const materialRepository = fakeMaterialRepository();
  materialRepository.findPublished = () => { throw new Error('SQLITE_IOERR'); };
  const service = setup({ materialRepository });

  assert.throws(() => service.list({}), (err) => {
    assert.ok(err instanceof ServiceUnavailableError);
    assert.equal(err.code, 'CATALOG_UNAVAILABLE');
    assert.ok(err.retryAfter > 0);
    return true;
  });
});

// ---------- Три рівні доступу ----------

test('get: гість бачить каталог і сторінку матеріалу, але не додає матеріал', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  assert.equal(service.get(null, id).id, id);
  assert.equal(service.list({}).total, 1);
  assert.throws(() => service.create(null, validBody(), key()), UnauthorizedError);
});

test('заблокований користувач має права гостя: бачить матеріал, але не додає', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());
  const blocked = Object.assign(Object.create(Object.getPrototypeOf(julia)), julia, { isBlocked: true });

  assert.equal(service.get(blocked, id).id, id);
  assert.throws(() => service.create(blocked, validBody(), key()), UnauthorizedError);
});

test('user: відкриває чужий матеріал, але не змінює і не видаляє його → 403', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  assert.equal(service.get(julia, id).id, id);
  assert.throws(() => service.update(julia, id, { title: 'Моя назва' }), ForbiddenError);
  assert.throws(() => service.remove(julia, id), ForbiddenError);
});

test('admin: змінює чужий матеріал', () => {
  const service = setup();
  const { id } = service.create(anna, validBody(), key());

  assert.equal(service.update(admin, id, { title: 'Виправлено адміном' }).title, 'Виправлено адміном');
});

test('listMine: лише власні матеріали; гість → 401', () => {
  const service = setup();
  service.create(anna, validBody(), key());
  service.create(julia, { ...validBody(), title: 'Матеріал Юлії' }, key());

  const mine = service.listMine(julia);
  assert.equal(mine.total, 1);
  assert.equal(mine.items[0].title, 'Матеріал Юлії');
  assert.throws(() => service.listMine(null), UnauthorizedError);
});

test('автор показується з актуальним нікнеймом після зміни в профілі', () => {
  const nicknames = { 1: 'Anna' };
  const idempotencyService = createIdempotencyService({ idempotencyRepository: fakeIdempotencyRepository(), now: () => NOW });
  const service = createMaterialService({
    materialRepository: fakeMaterialRepository(), storageService: fakeStorageService, idempotencyService, accessPolicy,
    userDirectory: { nicknameOf: (id) => nicknames[id] || null }, now: () => NOW, logger: silentLogger,
  });
  const { id } = service.create(anna, validBody(), key());

  nicknames[1] = 'Anna K'; // змінила нікнейм у профілі
  assert.equal(service.get(anna, id).authorNickname, 'Anna K');
  assert.equal(service.list({}).items[0].authorNickname, 'Anna K');
});
