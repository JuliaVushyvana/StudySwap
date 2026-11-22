// Юніт-тести storageService: завантаження й отримання файлів з урахуванням рівнів доступу.
// Таблицю й диск замінено фейками в пам'яті.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createStorageService } = require('../../service/storage/storageService');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../service/errors');
const { User } = require('../../domain/access/User');
const { accessPolicy } = require('../../service/access/accessService');

const born = new Date('2005-03-14');
const julia = Object.assign(new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash: 'x', birthDate: born }), { id: 2 });
const MB = 1024 * 1024;

function setup() {
  const rows = new Map();
  const disk = new Map();
  const fileRepository = { findById: (id) => rows.get(id) || null, insert: (f) => rows.set(f.id, f) };
  const fileStore = { write: (id, buf) => disk.set(id, buf), pathIfExists: (id) => (disk.has(id) ? `/mem/${id}` : null) };
  return { service: createStorageService({ fileRepository, fileStore, accessPolicy }), rows, disk };
}

const upload = (service, user, fileName, size = 10) => service.upload(user, { fileName, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 1) });

test('upload: зареєстрований завантажує pdf → id і url для POST /materials', () => {
  const { service, disk } = setup();
  const f = upload(service, julia, 'Шпаргалка.pdf');
  assert.equal(f.fileName, 'Шпаргалка.pdf');
  assert.equal(f.sizeBytes, 10);
  assert.equal(f.url, `/files/${f.id}`);
  assert.equal(disk.get(f.id).length, 10);
});

test('upload: гість → 401', () => {
  const { service } = setup();
  assert.throws(() => upload(service, null, 'a.pdf'), UnauthorizedError);
});

test('upload: непідтримуваний формат і завеликий файл → 400', () => {
  const { service } = setup();
  assert.throws(() => upload(service, julia, 'virus.exe'), (e) => e instanceof ValidationError && e.code === 'UNSUPPORTED_FORMAT');
  assert.throws(() => upload(service, julia, 'big.docx', 21 * MB), (e) => e instanceof ValidationError && e.code === 'FILE_TOO_LARGE');
  assert.throws(() => upload(service, julia, 'empty.pdf', 0), (e) => e instanceof ValidationError && e.code === 'FILE_EMPTY');
});

test('download: зареєстрований отримує файл, гість → 401, невідомий id → 404', () => {
  const { service } = setup();
  const f = upload(service, julia, 'конспект.pdf');
  const d = service.download(julia, f.id);
  assert.equal(d.fileName, 'конспект.pdf');
  assert.equal(d.path, `/mem/${f.id}`);
  assert.throws(() => service.download(null, f.id), UnauthorizedError);
  assert.throws(() => service.download(julia, 'nope'), NotFoundError);
  assert.throws(() => service.download(julia, '../etc/passwd'), NotFoundError);
});
