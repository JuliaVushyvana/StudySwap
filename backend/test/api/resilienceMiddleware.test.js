// Юніт-тести middleware з api/: rate limit, таймаут, штучні збої й формат помилки. Express не запускається.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../api/middleware/rateLimit');
const { requestTimeout } = require('../../api/middleware/timeout');
const { createFaultInjection } = require('../../api/middleware/faultInjection');
const { errorHandler } = require('../../api/middleware/errorHandler');
const { TooManyRequestsError, ServiceUnavailableError } = require('../../service/errors');

// Мінімальна заміна res з Express: запам'ятовує статус, заголовки й тіло
function fakeRes() {
  const listeners = {};
  return {
    statusCode: 200, headers: {}, body: undefined, headersSent: false,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; this.headersSent = true; (listeners.finish || []).forEach((f) => f()); return this; },
    on(event, fn) { (listeners[event] ||= []).push(fn); },
  };
}

// Викликає middleware і повертає аргумент next: undefined — пропустив далі, інакше помилка
const run = (mw, req = { ip: '1.1.1.1' }, res = fakeRes()) => {
  let result = 'not-called';
  mw(req, res, (err) => { result = err; });
  return result;
};

test('rateLimit: понад max запитів у вікні → TooManyRequestsError з Retry-After до кінця вікна', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 10_000, max: 2, now: () => t });

  assert.equal(run(limiter), undefined);
  assert.equal(run(limiter), undefined);
  t = 3_000;
  const err = run(limiter);
  assert.ok(err instanceof TooManyRequestsError);
  assert.equal(err.retryAfter, 7);
  assert.equal(run(limiter, { ip: '2.2.2.2' }), undefined, 'інша IP має власний ліміт');

  t = 10_000;
  assert.equal(run(limiter), undefined, 'нове вікно — лічильник з нуля');
});

test('timeout: відповідь не готова вчасно → ServiceUnavailableError REQUEST_TIMEOUT', async () => {
  const req = {};
  const errors = [];
  requestTimeout(20)(req, fakeRes(), (err) => { if (err) errors.push(err); });

  await new Promise((r) => setTimeout(r, 40));

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'REQUEST_TIMEOUT');
  assert.equal(req.timedOut, true);
});

test('timeout: відповідь віддано вчасно → таймер скасовано', async () => {
  const res = fakeRes();
  const errors = [];
  requestTimeout(20)({}, res, (err) => { if (err) errors.push(err); });
  res.status(200).json({ ok: true });

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(errors.length, 0);
});

test('faultInjection: залежно від random пропускає, затримує або повертає 503/500', async () => {
  const sequence = (...values) => { let i = 0; return () => values[i++]; };
  const call = async (random) => {
    let waited = 0;
    let result = 'not-called';
    const mw = createFaultInjection({ random, wait: async (ms) => { waited = ms; } });
    await mw({}, fakeRes(), (err) => { result = err; });
    return { result, waited };
  };

  assert.deepEqual(await call(sequence(0.9, 0.9)), { result: undefined, waited: 0 });
  const delayed = await call(sequence(0.1, 0.5, 0.9));
  assert.equal(delayed.result, undefined);
  assert.equal(delayed.waited, 1600);
  assert.equal((await call(sequence(0.9, 0.1, 0.2))).result.code, 'SERVICE_UNAVAILABLE');
  assert.equal((await call(sequence(0.9, 0.1, 0.7))).result.error, 'InternalError');
});

test('errorHandler: 429 і 503 → ErrorResponse із заголовком Retry-After і requestId', () => {
  const res = fakeRes();
  errorHandler(new TooManyRequestsError(3), { id: 'rid-1' }, res, () => {});
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '3');
  assert.deepEqual(res.body, { error: 'TooManyRequests', code: 'RATE_LIMITED', details: null, requestId: 'rid-1' });

  const res503 = fakeRes();
  errorHandler(new ServiceUnavailableError('REQUEST_TIMEOUT', 1), { id: 'rid-2' }, res503, () => {});
  assert.equal(res503.statusCode, 503);
  assert.equal(res503.headers['Retry-After'], '1');
  assert.equal(res503.body.code, 'REQUEST_TIMEOUT');
});
