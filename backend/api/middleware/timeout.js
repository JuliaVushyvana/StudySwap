// Серверний таймаут: якщо відповідь не готова за ms, клієнт отримує 503 REQUEST_TIMEOUT замість очікування без кінця.

const { ServiceUnavailableError } = require('../../service/errors');

const RETRY_AFTER = 1;

function requestTimeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      req.timedOut = true; // наступні middleware бачать, що відповідь уже віддано
      next(new ServiceUnavailableError('REQUEST_TIMEOUT', RETRY_AFTER));
    }, ms);
    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}

module.exports = { requestTimeout };
