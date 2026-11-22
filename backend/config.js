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
});

module.exports = { config };
