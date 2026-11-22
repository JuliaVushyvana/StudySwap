// OpenTelemetry для studyswap-api (Практика 8): трейси, метрики й логи по OTLP HTTP у колектор.
// Підвантажується перед застосунком: npm run start:otel (node -r ./tracing.js server.js).
// Адреса колектора й назва сервісу — стандартні змінні OTEL_* (див. backend/.env.example).

const path = require('path');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');

// З телеметрією логи пишуться ще й у файл (backend/logger.js), щоб їх можна було переглянути локально
process.env.LOG_FILE ||= path.join(__dirname, 'data', 'logs', 'app.log');

const exportIntervalMillis = Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL, 10) || 10_000;
const collector = new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318');

// Експортери самі беруть адресу з OTEL_EXPORTER_OTLP_ENDPOINT (+ /v1/traces, /v1/metrics, /v1/logs)
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'studyswap-api',
  traceExporter: new OTLPTraceExporter(),
  // SDK 3.x: metricReaders (масив) і BatchLogRecordProcessor({ exporter }) — старі metricReader / new X(exporter) мовчки ігноруються
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis })],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  instrumentations: [getNodeAutoInstrumentations({
    // /health смикає Docker healthcheck кожні 15 с — у трейсах і RED-метриках це лише шум
    // Власні запити експортерів у колектор теж не рахуємо: інакше в метриках з'являються http_client_* до :4318
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => req.url.startsWith('/health'),
      ignoreOutgoingRequestHook: (req) => String(req.port) === collector.port && req.hostname === collector.hostname,
    },
    // Спан на кожен middleware (cors, json, auth…) ховає за собою роут і обробник; лишаємо router і request handler
    '@opentelemetry/instrumentation-express': { ignoreLayersType: ['middleware'] },
    // Express 5 побудований на пакеті router: його інструментація дублює шари Express спанами «middleware - patched»
    '@opentelemetry/instrumentation-router': { enabled: false },
    // Читання файлів, DNS і TCP дають десятки дрібних спанів на запит без користі для аналізу
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false },
    '@opentelemetry/instrumentation-net': { enabled: false },
  })],
});

sdk.start();

// Перед виходом відправляємо в колектор те, що ще лежить у буферах
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    sdk.shutdown().catch((err) => console.error('OpenTelemetry shutdown:', err.message)).finally(() => process.exit(0));
  });
}
