// Штучні затримки й збої. Обидва варіанти вмикаються лише явно; у звичайному запуску не підключаються.

const { AppError, ServiceUnavailableError } = require('../../service/errors');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// FAULT_ERROR_RATE / FAULT_DELAY_MS (Практика 8): керовані перемикачі для перевірки RED-дашборду й алертів.
// errorRate — частка запитів (0..1), що завершуються 500; delayMs — затримка перед обробкою кожного запиту
function createFaultInjection({ errorRate = 0, delayMs = 0, random = Math.random, wait = sleep }) {
  return async (req, res, next) => {
    if (delayMs > 0) {
      await wait(delayMs);
      if (req.timedOut || res.headersSent) return; // поки чекали, спрацював таймаут
    }
    if (random() < errorRate) return next(new AppError('InternalError', 'FAULT_INJECTED', 'Штучний збій (FAULT_ERROR_RATE)'));
    next();
  };
}

// CHAOS=1 (Практика 5): випадкові збої для перевірки таймаутів, ретраїв і degraded mode на клієнті.
// delayRate — частка запитів із затримкою 1200..2000 мс; failRate — частка запитів, що завершуються 503 або 500
function createChaos({ delayRate = 0.15, failRate = 0.2, random = Math.random, wait = sleep }) {
  return async (req, res, next) => {
    if (random() < delayRate) {
      await wait(1200 + random() * 800);
      if (req.timedOut || res.headersSent) return; // поки чекали, спрацював таймаут
    }
    if (random() < failRate) {
      return next(random() < 0.5
        ? new ServiceUnavailableError('SERVICE_UNAVAILABLE', 2)
        : new AppError('InternalError', null, 'Штучний збій (CHAOS)'));
    }
    next();
  };
}

module.exports = { createFaultInjection, createChaos };
