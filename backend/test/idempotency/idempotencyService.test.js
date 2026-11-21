// Юніт-тести idempotencyService: сховище ключів замінено Map у пам'яті.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdempotencyService, TTL_MS } = require('../../service/idempotency/idempotencyService');
const { ValidationError, ConflictError } = require('../../service/errors');

function setup() {
  const rows = new Map();
  const repository = {
    find: (userId, key) => rows.get(`${userId}:${key}`) || null,
    save: ({ userId, key, ...entry }) => { rows.set(`${userId}:${key}`, entry); },
  };
  const clock = { t: new Date('2026-11-21T10:00:00Z') };
  const service = createIdempotencyService({ idempotencyRepository: repository, now: () => clock.t });
  return { service, clock };
}

const counter = () => {
  let calls = 0;
  const action = () => ({ id: ++calls });
  return { action, calls: () => calls };
};

test('run: повтор із тим самим ключем і тілом → збережений результат, action виконано один раз', () => {
  const { service } = setup();
  const { action, calls } = counter();

  const first = service.run({ userId: 1, key: 'k1', payload: { a: 1, b: 2 } }, action);
  const retry = service.run({ userId: 1, key: 'k1', payload: { b: 2, a: 1 } }, action);

  assert.deepEqual(retry, first);
  assert.equal(calls(), 1);
});

test('run: той самий ключ з іншим тілом → ConflictError IDEMPOTENCY_KEY_REUSED', () => {
  const { service } = setup();
  const { action } = counter();
  service.run({ userId: 1, key: 'k1', payload: { title: 'A' } }, action);

  assert.throws(() => service.run({ userId: 1, key: 'k1', payload: { title: 'B' } }, action), (err) => {
    assert.ok(err instanceof ConflictError);
    assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
    return true;
  });
});

test('run: ключі різних користувачів не перетинаються', () => {
  const { service } = setup();
  const { action, calls } = counter();
  service.run({ userId: 1, key: 'k1', payload: {} }, action);
  service.run({ userId: 2, key: 'k1', payload: {} }, action);
  assert.equal(calls(), 2);
});

test('run: без ключа або з некоректним ключем → ValidationError', () => {
  const { service } = setup();
  const { action, calls } = counter();
  assert.throws(() => service.run({ userId: 1, key: undefined, payload: {} }, action), { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  assert.throws(() => service.run({ userId: 1, key: 'має пробіл', payload: {} }, action), (err) => err instanceof ValidationError && err.code === 'INVALID_IDEMPOTENCY_KEY');
  assert.equal(calls(), 0);
});

test('run: помилка action не зберігається — ретрай із тим самим ключем виконується знову', () => {
  const { service } = setup();
  let fail = true;
  const action = () => { if (fail) throw new Error('збій'); return { id: 1 }; };

  assert.throws(() => service.run({ userId: 1, key: 'k1', payload: {} }, action), /збій/);
  fail = false;
  assert.deepEqual(service.run({ userId: 1, key: 'k1', payload: {} }, action), { id: 1 });
});

test('run: після TTL ключ можна використати знову', () => {
  const { service, clock } = setup();
  const { action, calls } = counter();
  service.run({ userId: 1, key: 'k1', payload: { title: 'A' } }, action);

  clock.t = new Date(clock.t.getTime() + TTL_MS);

  assert.deepEqual(service.run({ userId: 1, key: 'k1', payload: { title: 'B' } }, action), { id: 2 });
  assert.equal(calls(), 2);
});
