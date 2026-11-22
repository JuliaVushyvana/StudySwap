// Перетворює будь-яку помилку на ErrorResponse з docs/api/openapi.yaml.

const { AppError } = require('../../service/errors');
const logger = require('../../logger');

const STATUS = {
  ValidationError: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  TooManyRequests: 429,
  InternalError: 500,
  ServiceUnavailable: 503,
};

function sendError(res, req, status, { error, code = null, details = null }) {
  res.status(status).json({ error, code, details, requestId: req.id });
}

function notFound(req, res) {
  sendError(res, req, 404, { error: 'NotFound', code: 'ROUTE_NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Відповідь уже віддано (наприклад, спрацював таймаут, а обробник упав пізніше): лише логуємо
  if (res.headersSent) {
    logger.error(`помилка після відправленої відповіді: ${err.message}`, { request_id: req.id }, req.span);
    return;
  }
  if (err instanceof AppError) {
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    if (err.error === 'InternalError') req.span?.recordException(err);
    if (err.error === 'InternalError') logger.error(err.message, { request_id: req.id, code: err.code }, req.span);
    return sendError(res, req, STATUS[err.error], err);
  }
  // Файл більший за загальний ліміт завантаження (express.raw у POST /files)
  if (err.type === 'entity.too.large') {
    return sendError(res, req, 400, {
      error: 'ValidationError', code: 'FILE_TOO_LARGE',
      details: [{ field: 'file', message: 'Файл завеликий: найбільше 100 МБ (відео), інші формати — менше' }],
    });
  }
  // Некоректний JSON у тілі запиту (помилка express.json)
  if (err.type === 'entity.parse.failed') {
    return sendError(res, req, 400, {
      error: 'ValidationError', code: 'INVALID_JSON',
      details: [{ field: 'body', message: 'Тіло запиту не є коректним JSON' }],
    });
  }
  req.span?.recordException(err);
  logger.error(err.message, { request_id: req.id, stack: err.stack }, req.span);
  return sendError(res, req, 500, { error: 'InternalError' });
}

module.exports = { errorHandler, notFound };
