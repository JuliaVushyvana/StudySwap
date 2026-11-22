// Юніт-тести notificationService: репозиторій замінено фейком у пам'яті, БД не потрібна.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createNotificationService } = require('../../service/notifications/notificationService');
const { UnauthorizedError, NotFoundError } = require('../../service/errors');
const { User } = require('../../domain/access/User');
const { accessPolicy } = require('../../service/access/accessService');

const born = new Date('2005-03-14');
const anna = Object.assign(new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash: 'x', birthDate: born }), { id: 1 });
const julia = Object.assign(new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash: 'x', birthDate: born }), { id: 2 });

function fakeNotificationRepository() {
  const rows = new Map();
  let nextId = 1;
  const mine = (recipientId) => [...rows.values()].filter((n) => n.recipientId === recipientId);
  return {
    findByRecipient: (recipientId, limit) => mine(recipientId).sort((a, b) => b.id - a.id).slice(0, limit),
    countUnread: (recipientId) => mine(recipientId).filter((n) => !n.isRead()).length,
    findById: (id) => rows.get(id) || null,
    insert: (n) => { const id = nextId++; rows.set(id, Object.assign(n, { id })); return id; },
    markRead: (id, at) => rows.get(id).markAsRead(at),
    markAllRead: (recipientId, at) => mine(recipientId).forEach((n) => n.markAsRead(at)),
  };
}

// Годинник, що йде вперед на хвилину з кожним викликом
function setup() {
  let minute = 0;
  const now = () => new Date(Date.UTC(2026, 10, 23, 9, minute++));
  return createNotificationService({ notificationRepository: fakeNotificationRepository(), accessPolicy, now });
}

const commentFor = (service, recipientId, title) => service.notify({
  recipientId, kind: service.Kind.NEW_COMMENT, message: `Новий коментар від Julia до «${title}»`, link: '/materials/100',
});

test('list: свої сповіщення, спочатку нові, з лічильником непрочитаних; без подій — порожньо', () => {
  const service = setup();
  assert.deepEqual(service.list(anna), { items: [], unread: 0 });

  commentFor(service, anna.id, 'Нормалізація БД');
  commentFor(service, anna.id, 'Графи');
  commentFor(service, julia.id, 'ООП');

  const { items, unread } = service.list(anna);
  assert.equal(unread, 2);
  assert.deepEqual(items[0], {
    id: 2, kind: 'new_comment', message: 'Новий коментар від Julia до «Графи»',
    link: '/materials/100', createdAt: '2026-11-23T09:01:00.000Z', read: false,
  });
  assert.deepEqual(items.map((n) => n.id), [2, 1]);
});

test('markRead: позначає одне; повтор безпечний; чуже чи неіснуюче → 404', () => {
  const service = setup();
  const first = commentFor(service, anna.id, 'Нормалізація БД');
  commentFor(service, anna.id, 'Графи');
  const juliasOwn = commentFor(service, julia.id, 'ООП');

  service.markRead(anna, String(first));
  service.markRead(anna, String(first));

  const { items, unread } = service.list(anna);
  assert.equal(unread, 1);
  assert.equal(items.find((n) => n.id === first).read, true);
  assert.throws(() => service.markRead(anna, String(juliasOwn)), { code: 'NOTIFICATION_NOT_FOUND' });
  assert.throws(() => service.markRead(anna, '999'), NotFoundError);
  assert.throws(() => service.markRead(anna, 'abc'), NotFoundError);
  assert.equal(service.list(julia).unread, 1);
});

test('markAllRead: усі свої прочитані, чужі не зачіпає', () => {
  const service = setup();
  commentFor(service, anna.id, 'Нормалізація БД');
  commentFor(service, anna.id, 'Графи');
  commentFor(service, julia.id, 'ООП');

  service.markAllRead(anna);

  assert.equal(service.list(anna).unread, 0);
  assert.equal(service.list(julia).unread, 1);
});

test('гість → 401 на всі операції; невідомий вид сповіщення не створюється', () => {
  const service = setup();

  assert.throws(() => service.list(null), UnauthorizedError);
  assert.throws(() => service.markRead(null, '1'), UnauthorizedError);
  assert.throws(() => service.markAllRead(null), UnauthorizedError);
  assert.throws(() => service.notify({ recipientId: 1, kind: 'spam', message: 'x' }), /Невідомий вид сповіщення/);
});
