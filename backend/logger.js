// Структуровані логи: один JSON-рядок на подію з trace_id/span_id запиту, щоб від логу перейти до трейсу.
// Запис іде у файл LOG_FILE (його задає tracing.js) і в OpenTelemetry Logs; без tracing.js обидва вимкнені.
// error додатково друкується в консоль, як і раніше.

const fs = require('fs');
const path = require('path');
const { trace, context, logs } = require('@opentelemetry/api');

const SERVICE = process.env.OTEL_SERVICE_NAME || 'studyswap-api';
const SEVERITY = { info: 9, warn: 13, error: 17 }; // SeverityNumber з OpenTelemetry Logs

const otelLogger = logs.getLogger(SERVICE);
let file = null;
function fileStream() {
  if (!file && process.env.LOG_FILE) {
    fs.mkdirSync(path.dirname(process.env.LOG_FILE), { recursive: true });
    file = fs.createWriteStream(process.env.LOG_FILE, { flags: 'a' });
  }
  return file;
}

// span — спан запиту; без нього береться активний (для логів поза обробкою запиту його немає)
function write(level, msg, fields = {}, span = trace.getActiveSpan()) {
  const { traceId, spanId } = span ? span.spanContext() : {};
  const record = { ts: new Date().toISOString(), level, service: SERVICE, msg, ...fields, trace_id: traceId, span_id: spanId };

  fileStream()?.write(`${JSON.stringify(record)}\n`);
  otelLogger.emit({
    severityNumber: SEVERITY[level], severityText: level.toUpperCase(), body: msg,
    attributes: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null)),
    context: span ? trace.setSpan(context.active(), span) : context.active(),
  });
  if (level === 'error') console.error(fields.request_id ? `[${fields.request_id}] ${msg}` : msg);
}

module.exports = {
  info: (msg, fields, span) => write('info', msg, fields, span),
  warn: (msg, fields, span) => write('warn', msg, fields, span),
  error: (msg, fields, span) => write('error', msg, fields, span),
};
