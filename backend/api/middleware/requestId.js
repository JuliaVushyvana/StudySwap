// Кожен запит отримує requestId: береться з X-Request-Id або генерується. Повертається в заголовку й у помилках.

const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
