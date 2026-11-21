// Ідемпотентність операцій створення: повтор запиту з тим самим Idempotency-Key не створює дубліката.
// Публічний інтерфейс модуля idempotency; ним користуються use-case-и інших модулів.

const crypto = require('crypto');
const { ValidationError, ConflictError } = require('../errors');

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,255}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

// JSON з відсортованими ключами: { a, b } і { b, a } дають однаковий хеш
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const hashPayload = (payload) => crypto.createHash('sha256').update(canonical(payload)).digest('hex');

function createIdempotencyService({ idempotencyRepository, ttlMs = TTL_MS, now = () => new Date() }) {
  return {
    // Виконує action один раз для пари (користувач, ключ). Повтор із тим самим payload повертає збережений
    // результат, з іншим — ConflictError. Помилки action не зберігаються: виправлений запит можна надіслати з тим самим ключем.
    // Гонки між двома однаковими запитами немає: action і запис у БД синхронні й виконуються в одному потоці Node.
    run({ userId, key, payload }, action) {
      if (key === undefined || key === '') {
        throw new ValidationError([{ field: 'Idempotency-Key', code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Потрібен заголовок Idempotency-Key' }]);
      }
      if (!KEY_PATTERN.test(key)) {
        throw new ValidationError([{ field: 'Idempotency-Key', code: 'INVALID_IDEMPOTENCY_KEY', message: 'Ключ — до 255 символів: латиниця, цифри, _ . : -' }]);
      }

      const requestHash = hashPayload(payload);
      const saved = idempotencyRepository.find(userId, key);
      if (saved && now() - saved.createdAt < ttlMs) {
        if (saved.requestHash !== requestHash) throw new ConflictError('IDEMPOTENCY_KEY_REUSED');
        return saved.response;
      }

      const response = action();
      idempotencyRepository.save({ userId, key, requestHash, response, createdAt: now() });
      return response;
    },
  };
}

module.exports = { createIdempotencyService, TTL_MS };
