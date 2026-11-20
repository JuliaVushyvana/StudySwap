// Юніт-тести materialService: репозиторій і сховище замінено фейками в пам'яті, БД не потрібна.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMaterialService } = require('../../service/catalog/materialService');
const { ValidationError, ForbiddenError, NotFoundError, UnauthorizedError } = require('../../service/errors');
const { User, Role } = require('../../domain/access/User');

const NOW = new Date('2026-11-20T10:15:00Z');
const born = new Date('2005-03-14');
const anna = Object.assign(new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash: 'x', birthDate: born }), { id: 1 });
const ivan = Object.assign(new User({ nickname: 'Ivan', login: 'ivan_p', email: 'ivan@uni.ua', passwordHash: 'x', birthDate: born }), { id: 2 });
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

const validBody = () => ({
  title: 'Нормалізація БД', description: '1НФ–3НФ з прикладами', subject: 'Бази даних',
  university: 'КПІ', course: 2, type: 'конспект', fileId: 'f-8c1e2b',
});

function setup() {
  return createMaterialService({ materialRepository: fakeMaterialRepository(), storageService: fakeStorageService, now: () => NOW });
}

test('create: коректні дані → матеріал за схемою MaterialResponse', () => {
  const service = setup();

  const created = service.create(anna, validBody());

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
  assert.deepEqual(service.get(100), created);
});

test('create: без title → ValidationError TITLE_REQUIRED', () => {
  const service = setup();
  const { title, ...withoutTitle } = validBody();

  assert.throws(() => service.create(anna, withoutTitle), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.code, 'TITLE_REQUIRED');
    assert.deepEqual(err.details, [{ field: 'title', message: 'Назва обов\'язкова' }]);
    return true;
  });
  assert.equal(service.list({}).total, 0);
});

test('create: файл поза лімітами → ValidationError INVALID_FILE', () => {
  const service = setup();
  assert.throws(() => service.create(anna, { ...validBody(), fileId: 'f-huge' }), { code: 'INVALID_FILE' });
});

test('create: без користувача → UnauthorizedError', () => {
  const service = setup();
  assert.throws(() => service.create(null, validBody()), UnauthorizedError);
});

test('update: автор змінює поля, updatedAt оновлюється', () => {
  let now = NOW;
  const service = createMaterialService({ materialRepository: fakeMaterialRepository(), storageService: fakeStorageService, now: () => now });
  const { id } = service.create(anna, validBody());
  now = new Date('2026-11-20T11:20:00Z');

  const updated = service.update(anna, String(id), { title: 'Нормалізація БД (оновлено)', course: 3 });

  assert.equal(updated.title, 'Нормалізація БД (оновлено)');
  assert.equal(updated.course, 3);
  assert.equal(updated.updatedAt, '2026-11-20T11:20:00.000Z');
});

test('update: чужий матеріал → ForbiddenError, порожнє тіло → EMPTY_UPDATE', () => {
  const service = setup();
  const { id } = service.create(anna, validBody());

  assert.throws(() => service.update(ivan, id, { title: 'Моє' }), ForbiddenError);
  assert.throws(() => service.update(anna, id, {}), { code: 'EMPTY_UPDATE' });
  assert.throws(() => service.update(anna, id, { fileId: 'f-8c1e2b' }), { code: 'UNKNOWN_FIELD' });
});

test('remove: адмін видаляє чужий матеріал, після цього він 404', () => {
  const service = setup();
  const { id } = service.create(anna, validBody());

  service.remove(admin, id);

  assert.throws(() => service.get(id), NotFoundError);
  assert.throws(() => service.remove(admin, id), NotFoundError);
});

test('list: пошук, фільтр і некоректний параметр', () => {
  const service = setup();
  service.create(anna, validBody());
  service.create(ivan, { ...validBody(), title: 'Принципи ООП', subject: 'ООП', course: 1 });

  assert.deepEqual(service.list({ q: 'нормалізація', course: '2' }).items.map((m) => m.title), ['Нормалізація БД']);
  assert.equal(service.list({ sort: 'title' }).total, 2);
  assert.throws(() => service.list({ course: '9' }), { code: 'COURSE_OUT_OF_RANGE' });
});
