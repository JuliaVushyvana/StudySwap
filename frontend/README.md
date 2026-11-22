# Фронтенд StudySwap

Звичайні HTML-сторінки без збирання: головна (`index.html` + `app.js`) і вхід/реєстрація (`auth.html` + `auth.js`, вкладки `#login` і `#register`), спільні `styles.css` і `lib/` (токен входу зберігає `lib/session.js`). Запуск:

1. Запустити бекенд: `cd backend && npm start` (http://localhost:3000).
2. Відкрити `frontend/index.html` у браузері (подвійний клік по файлу).

## Обробка помилок (Практика 5)

| Вимога | Де в коді |
|---|---|
| Таймаут запиту через `AbortController` | `lib/http.js` → `fetchWithResilience`, `timeoutMs` |
| `GET /health` відміняється, якщо довше 1 с | `app.js` → `checkHealth`, `HEALTH_TIMEOUT_MS = 1000` |
| Ретраї на 5xx і мережеві збої з експоненційним backoff і джитером | `lib/http.js` → `backoff()`: 300 → 600 → 1200 мс + до 100 мс випадково |
| 429: чекати `Retry-After` і повторити | `lib/http.js` → `retryAfterMs()` |
| `X-Request-Id` у кожному запиті (один на всі повтори) | `lib/http.js` |
| Ідемпотентний POST: `Idempotency-Key` від хешу даних | `lib/idempotency.js` → `getOrReuseKey()` (SHA-256 → localStorage) |
| Єдиний формат помилки `{ error, code, details, requestId }` | `lib/http.js` → `readError()`, показ у `app.js` → `describeError()` |
| Degraded mode: банер і вимкнені кнопки після 3 збоїв поспіль | `lib/degraded.js`, `app.js` → `onChange` |

Збоєм для degraded mode вважається 5xx, 429 після всіх повторів, таймаут або мережева помилка.
Через 10 с сторінка сама перевіряє `/health`; якщо сервер відповів `ok`, кнопки вмикаються.

Кнопка «Демо: подвійний клік» надсилає два однакові POST одночасно з тим самим ключем:
обидві відповіді мають бути 201 з однаковим `id`.

## Що потрібно від бекенду

- Читати заголовок `Idempotency-Key` у `POST /materials` і на повтор повертати збережений результат.
- `GET /health` → `{ "status": "ok" }` (старий текст `ok` сторінка теж розуміє).
- CORS: `exposedHeaders: ['X-Request-Id', 'Retry-After']`, інакше браузер не дасть JS прочитати ці заголовки.
