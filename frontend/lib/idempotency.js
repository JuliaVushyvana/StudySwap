// Idempotency-Key для POST (Практика 5).
// Ключ залежить від вмісту запиту: однакові дані → той самий ключ,
// тож подвійний клік, повтор після таймауту чи оновлення сторінки не створять дубль.
// Ключ зберігається в localStorage під idem:<sha256(payload)>.

(function (global) {
  'use strict';

  const PREFIX = 'idem:';

  // Однаковий JSON для однакових даних незалежно від порядку полів
  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  async function payloadHash(obj) {
    const data = new TextEncoder().encode(stableStringify(obj));
    const digest = await global.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Сховище може бути недоступне (приватний режим, file:// у деяких браузерах) — тоді пам'ять
  const memory = new Map();
  const store = {
    get(k) { try { return global.localStorage.getItem(k); } catch (_) { return memory.get(k) || null; } },
    set(k, v) { try { global.localStorage.setItem(k, v); } catch (_) { memory.set(k, v); } },
    remove(k) { try { global.localStorage.removeItem(k); } catch (_) { /* ignore */ } memory.delete(k); },
  };

  async function getOrReuseKey(payload) {
    const name = PREFIX + await payloadHash(payload);
    const existing = store.get(name);
    if (existing) return existing;
    const fresh = global.StudyHttp.uuid();
    store.set(name, fresh);
    return fresh;
  }

  // Після помилки валідації (4xx) ключ скидаємо: користувач виправить дані й надішле новий запит
  async function forgetKey(payload) {
    store.remove(PREFIX + await payloadHash(payload));
  }

  global.StudyIdem = { getOrReuseKey, forgetKey, payloadHash, stableStringify };
}(typeof window !== 'undefined' ? window : globalThis));
