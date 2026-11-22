# Практична 8. Observability: Grafana, Loki, Tempo, OpenTelemetry

Сервіс: **studyswap-api** (бекенд StudySwap, Express 5 + SQLite). Стенд — [observability-demo](https://github.com/vivalafit/observability-demo).

## 90. Підключення OTEL

### Бібліотеки

| Пакет | Навіщо |
|---|---|
| `@opentelemetry/sdk-node` | NodeSDK: збирає трейси, метрики й логи в один запуск |
| `@opentelemetry/auto-instrumentations-node` | автоінструментація `http` і `express`: HTTP-спани, `http.route`, метрики `http.server.request.duration` |
| `@opentelemetry/exporter-trace-otlp-http` | трейси → `POST /v1/traces` колектора |
| `@opentelemetry/exporter-metrics-otlp-http` + `@opentelemetry/sdk-metrics` | метрики → `/v1/metrics`, раз на 10 с (`PeriodicExportingMetricReader`) |
| `@opentelemetry/exporter-logs-otlp-http` + `@opentelemetry/sdk-logs` | логи → `/v1/logs` (`BatchLogRecordProcessor`) |
| `@opentelemetry/api`, `@opentelemetry/core` | API для атрибутів і логів у коді; `getRPCMetadata` — доступ до серверного спану запиту |

SDK 3.x: читачі метрик передаються як `metricReaders: [...]`, процесор логів — як `new BatchLogRecordProcessor({ exporter })`. Старий стиль із прикладів (`metricReader`, `new BatchLogRecordProcessor(exporter)`) не дає помилки, але метрики тоді йдуть раз на 60 с, а логи не йдуть зовсім.

### Як підключено

- `backend/tracing.js` стартує SDK **до** застосунку: `npm run start:otel` = `node --env-file-if-exists=.env -r ./tracing.js server.js`. Звичайний `npm start` і тести працюють без телеметрії (API OpenTelemetry тоді no-op).
- Автоінструментація: `http` (без `/health` і без власних запитів експортерів до `:4318`), `express` (лише router і request handler, без спану на кожен middleware). `fs`, `dns`, `net`, `router` вимкнені: дрібні спани або дублікати шарів Express 5.
- Логи — `backend/logger.js`: JSON-рядок на подію в `backend/data/logs/app.log` (з полями `trace_id`, `span_id`, `request_id`) і той самий запис по OTLP Logs у Loki. Access-лог пише `api/middleware/telemetry.js` після кожної відповіді; рівень — `info` / `warn` (4xx) / `error` (5xx).

Приклад рядка `app.log`:

```json
{"ts":"2026-11-22T20:07:19.647Z","level":"info","service":"studyswap-api","msg":"POST /auth/login 200","request_id":"ca6c5291-…","method":"POST","route":"/auth/login","path":"/auth/login","status":200,"duration_ms":79.6,"app_context":"identity","user_id":2,"trace_id":"4b964c7dc9fffafeb16af666bc42c589","span_id":"e7707333fef92fb6"}
```

### Змінні оточення (`backend/.env.example`)

| Змінна | Значення | Що робить |
|---|---|---|
| `OTEL_SERVICE_NAME` | `studyswap-api` | `service.name` у Tempo, лейбл `service_name` у Prometheus і Loki |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP колектора; шляхи `/v1/traces`, `/v1/metrics`, `/v1/logs` додаються самі |
| `OTEL_METRIC_EXPORT_INTERVAL` | `10000` (за замовч.) | як часто відправляти метрики, мс |
| `LOG_FILE` | `backend/data/logs/app.log` (за замовч.) | файл JSON-логів |
| `FAULT_ERROR_RATE` | `0` (вимкнено) | частка запитів 0..1, що завершуються 500 |
| `FAULT_DELAY_MS` | `0` (вимкнено) | затримка кожного запиту, мс |
| `RATE_LIMIT_MAX` | `100000` для навантаження | інакше `scripts/load.sh` упирається в 429 (50 запитів / 10 с) |

### Атрибути спанів

Усі атрибути пишуться на серверний HTTP-спан (`GET /materials/:id` тощо).

| Атрибут | Звідки | Приклад |
|---|---|---|
| `http.route` | інструментація Express (шаблон роуту, не конкретний URL) | `/materials/:id` |
| `user.id` | `req.user` (currentUser) у `api/middleware/auth.js`; для `POST /auth/login` — з результату входу | `2` |
| `material.id` | `router.param('id')` у `materialsRouter`; для `POST /materials` — id створеного матеріалу | `5` |
| `app.context` | bounded context роуту: `/materials` → `catalog`, `/auth` і `/users` → `identity`, `/files` → `storage` | `catalog` |
| `request.id` | `X-Request-Id` (той самий, що в `ErrorResponse.requestId`) | `ca6c5291-…` |

Для 500 додатково записується подія `exception` зі стеком. Ті самі поля (`user_id`, `material_id`, `app_context`, `request_id`) є в access-логу.

### Як користуватися атрибутами в Grafana

1. **Tempo → Search (TraceQL)**: усі повільні запити до каталогу конкретного матеріалу:
   `{resource.service.name="studyswap-api" && span.app.context="catalog" && span.material.id="5" && duration > 300ms}`.
   Скарга користувача «у мене не відкривається» → `{resource.service.name="studyswap-api" && span.user.id=2 && status=error}`.
2. **Loki → трейс**: `{service_name="studyswap-api", level="ERROR"} | json` показує збої з `traceid`; по ньому відкривається трейс у Tempo. Пошук за запитом із повідомлення про помилку — `{service_name="studyswap-api"} |= "<requestId>"`.

### Скріни

- [ ] Tempo: трейс `studyswap-api` з атрибутами серверного спану — `docs/practice8/tempo-trace.png`

## Як запустити

```bash
# 1. Стенд (окремий репозиторій). Конфіги колектора й Prometheus — з цього репо:
#    у демо колектор не приймає OTLP-метрики (немає metrics-пайплайну) і бере логи лише з файлів.
cp observability/otel-collector-config.yaml observability/prometheus.yml ../observability-demo/
cd ../observability-demo && docker compose up -d --build
docker compose stop loadgen app          # demo-app займає порт 3000 і шумить у даних

# 2. API з телеметрією
cd ../StudySwap/backend && cp .env.example .env && npm install && npm run start:otel
#    збої для алертів: FAULT_ERROR_RATE=0.2 npm run start:otel  або  FAULT_DELAY_MS=800 npm run start:otel

# 3. Навантаження
../scripts/load.sh                       # WORKERS=4 DURATION=60 BASE_URL=http://localhost:3000
```

Зміни в `observability/otel-collector-config.yaml` (позначені коментарем `studyswap-api`): пайплайн `metrics` (OTLP → експортер `prometheus` на `collector:8889` з лейблом `service_name`), приймач `otlp` у пайплайні `logs`, лейбли Loki `service_name` і `level`. У `prometheus.yml` — job `studyswap-api` (`collector:8889`, `honor_labels: true`).

## Передача Розробнику 2

**Гілка:** `feat/otel`. **Запуск:** див. «Як запустити» вище.

### Метрики в Prometheus (звірено через `/api/v1/series`)

| Метрика | Тип | Що це |
|---|---|---|
| `http_server_request_duration_seconds_bucket` / `_count` / `_sum` | histogram, **секунди** | тривалість вхідних HTTP-запитів; `_count` — кількість запитів |
| `nodejs_eventloop_delay_p99_seconds`, `nodejs_eventloop_utilization_ratio` | gauge | затримка й завантаження event loop |
| `v8js_memory_heap_used_bytes`, `v8js_gc_duration_seconds_*` | gauge / histogram | пам'ять і GC |

Лейбли `http_server_request_duration_seconds_*`: `service_name="studyswap-api"`, `job="studyswap-api"`, `instance` (новий після кожного перезапуску), `http_route`, `http_request_method`, `http_response_status_code`, `error_type` (лише для 5xx), `url_scheme`, `network_protocol_version`, `le` (bucket).

`http_route` порожній, якщо запит не дійшов до роуту: 404 невідомого шляху, 429 і штучні 500 з `FAULT_ERROR_RATE` (збій стається до маршрутизації). Тому в error rate фільтруйте лише за `service_name`, а не за `http_route`.

Перевірені запити (під навантаженням `load.sh` з `FAULT_ERROR_RATE=0.1`: ~26 RPS, 9.5 % 5xx, p95 66 мс):

```promql
# Rate, запитів/с за роутами
sum by (http_route) (rate(http_server_request_duration_seconds_count{service_name="studyswap-api"}[5m]))

# Errors, % 5xx
100 * sum(rate(http_server_request_duration_seconds_count{service_name="studyswap-api", http_response_status_code=~"5.."}[5m]))
    / sum(rate(http_server_request_duration_seconds_count{service_name="studyswap-api"}[5m]))

# Duration, p95 у мс (метрика в секундах)
1000 * histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{service_name="studyswap-api"}[5m])))
```

### Логи в Loki

Лейбли: `service_name="studyswap-api"`, `job="studyswap-api"`, `level` (`INFO` / `WARN` / `ERROR`), `exporter="OTLP"`, `instance`. Рядок — JSON з полями `body`, `traceid`, `spanid`, `severity`, `attributes` (`request_id`, `route`, `status`, `duration_ms`, `user_id`, `material_id`, `app_context`).

```logql
{service_name="studyswap-api", level="ERROR"}
{service_name="studyswap-api"} | json | attributes_status >= 500
```

### Трейси в Tempo

`service.name = studyswap-api`; атрибути серверного спану — у таблиці вище. Стенд семплує трейси в колекторі (`tail_sampling`): усі помилкові, усі довші за 400 мс і 10 % решти — тож не кожен запит з `load.sh` буде в Tempo.

### Fault-перемикачі

`api/middleware/faultInjection.js`, підключається лише коли хоч один перемикач > 0; `/health` не зачіпає.

| Змінна | Діапазон | Ефект | Для якого алерту |
|---|---|---|---|
| `FAULT_ERROR_RATE` | `0..1`, за замовч. `0` | така частка запитів повертає `500 InternalError` з `code: FAULT_INJECTED` | error rate (> 1–5 % за 5 хв) |
| `FAULT_DELAY_MS` | мс, за замовч. `0` | кожен запит чекає стільки перед обробкою | p95 latency (> 500 мс) |

Задаються в `backend/.env` або перед командою: `FAULT_ERROR_RATE=0.2 FAULT_DELAY_MS=600 npm run start:otel`. Старий `CHAOS=1` (Практика 5: випадкові 503/500 і затримки для перевірки фронтенду) лишився без змін.
