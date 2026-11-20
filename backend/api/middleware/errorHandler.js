// Перетворює будь-яку помилку на ErrorResponse з docs/api/openapi.yaml.

const { AppError } = require('../../service/errors');

const STATUS = {
  ValidationError: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
};

function sendError(res, req, status, { error, code = null, details = null }) {
  res.status(status).json({ error, code, details, requestId: req.id });
}

function notFound(req, res) {
  sendError(res, req, 404, { error: 'NotFound', code: 'ROUTE_NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, req, STATUS[err.error], err);
  }
  // Некоректний JSON у тілі запиту (помилка express.json)
  if (err.type === 'entity.parse.failed') {
    return sendError(res, req, 400, {
      error: 'ValidationError', code: 'INVALID_JSON',
      details: [{ field: 'body', message: 'Тіло запиту не є коректним JSON' }],
    });
  }
  console.error(`[${req.id}]`, err);
  return sendError(res, req, 500, { error: 'InternalError' });
}

module.exports = { errorHandler, notFound };
