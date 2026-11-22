// Телеметрія запиту (Практика 8): атрибути HTTP-спану й рядок access-логу з trace_id.
// http.route ставить сама інструментація Express; тут — request.id, user.id, material.id, app.context.
// Без tracing.js (npm start, тести) спан не записується, і атрибути просто відкидаються.

const { context } = require('@opentelemetry/api');
const { getRPCMetadata } = require('@opentelemetry/core');
const logger = require('../../logger');

// Перший middleware застосунку: запам'ятовує серверний спан, щоб роути й middleware дописували в нього атрибути.
// trace.getActiveSpan() тут не підходить: у middleware активний спан шару Express, а не HTTP-запиту
function requestTelemetry(req, res, next) {
  req.span = getRPCMetadata(context.active())?.span;
  setRequestAttributes(req, { 'request.id': req.id });
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const fields = {
      request_id: req.id,
      method: req.method,
      // як http.route у спані: /materials, а не /materials/; undefined — запит не дійшов до роуту
      route: req.route ? req.baseUrl + (req.route.path === '/' && req.baseUrl ? '' : req.route.path) : undefined,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      ...req.telemetry,
    };
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${fields.path} ${res.statusCode}`, fields, req.span);
  });
  next();
}

// attributes — { 'user.id': 1, ... }; порожні значення пропускаються. Ті самі поля потрапляють у access-лог
function setRequestAttributes(req, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    req.span?.setAttribute(key, value);
    if (key !== 'request.id') (req.telemetry ||= {})[key.replace('.', '_')] = value;
  }
}

// Bounded context, до якого належить роут: catalog, identity, storage
const appContext = (name) => (req, res, next) => {
  setRequestAttributes(req, { 'app.context': name });
  next();
};

module.exports = { requestTelemetry, setRequestAttributes, appContext };
