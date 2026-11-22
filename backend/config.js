// Налаштування з env-змінних; значення за замовчуванням підходять для локального запуску.

const path = require('path');

const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Частка 0..1; некоректне значення або поза межами — fallback
const rate = (name, fallback) => {
  const value = Number.parseFloat(process.env[name]);
  return value >= 0 && value <= 1 ? value : fallback;
};

const config = Object.freeze({
  port: int('PORT', 3000),
  dbFile: process.env.DB_FILE || undefined, // шлях до файлу SQLite; без нього — backend/data.db
  filesDir: process.env.FILES_DIR || path.join(__dirname, 'uploads'), // вміст завантажених файлів
  requestTimeoutMs: int('REQUEST_TIMEOUT_MS', 5000),
  rateLimit: { windowMs: int('RATE_LIMIT_WINDOW_MS', 10_000), max: int('RATE_LIMIT_MAX', 50) },
  chaos: process.env.CHAOS === '1', // штучні затримки й збої для перевірки клієнта
  // Керовані збої для перевірки дашборду й алертів (Практика 8); 0 — вимкнено
  fault: { errorRate: rate('FAULT_ERROR_RATE', 0), delayMs: Number.parseInt(process.env.FAULT_DELAY_MS, 10) || 0 },
  // Ключ підпису JWT. Значення за замовчуванням — лише для локальної розробки, у Docker/проді задати JWT_SECRET
  jwtSecret: process.env.JWT_SECRET || 'studyswap-dev-secret-change-me',
  tokenTtlSeconds: int('TOKEN_TTL_SECONDS', 3600),
  bcryptRounds: int('BCRYPT_ROUNDS', 10),
});

module.exports = { config };
