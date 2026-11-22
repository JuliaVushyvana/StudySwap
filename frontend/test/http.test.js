// Тести lib/http.js (Практика 5): backoff, Retry-After, ретраї на 5xx, без ретраїв на 4xx, таймаут.
// Справжній HTTP-сервер на випадковому порту, який віддає заздалегідь задані відповіді.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { fetchWithResilience, backoff, retryAfterMs } = require('../lib/http.js');

function startServer(plan) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ requestId: req.headers['x-request-id'], idem: req.headers['idempotency-key'] });
    const step = plan.shift() || { status: 200 };
    setTimeout(() => {
      if (step.retryAfter) res.setHeader('Retry-After', step.retryAfter);
      res.writeHead(step.status, { 'Content-Type': 'application/json' });
      res.end('{}');
    }, step.delay || 0);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}/`, seen, close: () => server.close() });
  }));
}

test('backoff росте експоненційно і не перевищує стелю', () => {
  assert.equal(backoff(300, 0, false, 5000), 300);
  assert.equal(backoff(300, 2, false, 5000), 1200);
  assert.equal(backoff(300, 10, false, 5000), 5000);
  const withJitter = backoff(300, 1, true, 5000);
  assert.ok(withJitter >= 600 && withJitter < 700);
});

test('Retry-After: секунди, дата або запасне значення', () => {
  assert.equal(retryAfterMs('2', 100), 2000);
  assert.equal(retryAfterMs(null, 100), 100);
  assert.ok(retryAfterMs(new Date(Date.now() + 3000).toUTCString(), 100) > 1000);
});

test('5xx повторюється, той самий X-Request-Id і Idempotency-Key на всі спроби', async () => {
  const srv = await startServer([{ status: 503 }, { status: 502 }, { status: 201 }]);
  try {
    const res = await fetchWithResilience(srv.url, { method: 'POST', body: '{}', idempotencyKey: 'k-1', retry: { baseDelayMs: 10 } });
    assert.equal(res.status, 201);
    assert.equal(srv.seen.length, 3);
    assert.equal(new Set(srv.seen.map((s) => s.requestId)).size, 1);
    assert.ok(srv.seen.every((s) => s.idem === 'k-1'));
  } finally { srv.close(); }
});

test('4xx не повторюється', async () => {
  const srv = await startServer([{ status: 400 }]);
  try {
    const res = await fetchWithResilience(srv.url, { retry: { baseDelayMs: 10 } });
    assert.equal(res.status, 400);
    assert.equal(srv.seen.length, 1);
  } finally { srv.close(); }
});

test('таймаут через AbortController → помилка kind=timeout', async () => {
  const srv = await startServer([{ status: 200, delay: 500 }]);
  try {
    await assert.rejects(fetchWithResilience(srv.url, { retry: { retries: 0, timeoutMs: 100 } }), (e) => e.kind === 'timeout');
  } finally { srv.close(); }
});
