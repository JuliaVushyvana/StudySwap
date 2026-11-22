// Штучні затримки й збої для перевірки таймаутів, ретраїв і degraded mode на клієнті (Практика 5).
// Вмикається лише явно (CHAOS=1); у звичайному запуску не підключається.

const { AppError, ServiceUnavailableError } = require('../../service/errors');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// delayRate — частка запитів із затримкою 1200..2000 мс; failRate — частка запитів, що завершуються 503 або 500
function createFaultInjection({ delayRate = 0.15, failRate = 0.2, random = Math.random, wait = sleep }) {
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

module.exports = { createFaultInjection };
