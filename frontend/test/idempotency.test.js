// Тести lib/idempotency.js: однакові дані → той самий Idempotency-Key, різні → різний.

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis;
require('../lib/http.js'); // ключ генерує StudyHttp.uuid()
require('../lib/idempotency.js');
const { getOrReuseKey, forgetKey, stableStringify } = globalThis.StudyIdem;

test('stableStringify не залежить від порядку полів', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
});

test('той самий payload → той самий ключ (повтор не створить дубль)', async () => {
  const k1 = await getOrReuseKey({ title: 'Конспект', course: 2 });
  const k2 = await getOrReuseKey({ course: 2, title: 'Конспект' });
  assert.equal(k1, k2);
  assert.notEqual(await getOrReuseKey({ title: 'Інший', course: 2 }), k1);
});

test('після forgetKey (помилка 4xx) — новий ключ', async () => {
  const payload = { title: 'Виправлю й надішлю знову' };
  const k1 = await getOrReuseKey(payload);
  await forgetKey(payload);
  assert.notEqual(await getOrReuseKey(payload), k1);
});
