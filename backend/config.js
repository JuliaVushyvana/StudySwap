// Налаштування з env-змінних; значення за замовчуванням підходять для локального запуску.

const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const config = Object.freeze({
  port: int('PORT', 3000),
  requestTimeoutMs: int('REQUEST_TIMEOUT_MS', 5000),
  rateLimit: { windowMs: int('RATE_LIMIT_WINDOW_MS', 10_000), max: int('RATE_LIMIT_MAX', 50) },
  chaos: process.env.CHAOS === '1', // штучні затримки й збої для перевірки клієнта
  // Ключ підпису JWT. Значення за замовчуванням — лише для локальної розробки, у Docker/проді задати JWT_SECRET
  jwtSecret: process.env.JWT_SECRET || 'studyswap-dev-secret-change-me',
  tokenTtlSeconds: int('TOKEN_TTL_SECONDS', 3600),
  bcryptRounds: int('BCRYPT_ROUNDS', 10),
});

module.exports = { config };
