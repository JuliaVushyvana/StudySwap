// HTTP-хелпер зі стійкістю до збоїв (Практика 5):
//  - таймаут кожної спроби через AbortController;
//  - ретраї на 5xx і мережеві збої з експоненційним backoff і джитером;
//  - на 429 чекає стільки, скільки сказав заголовок Retry-After, і повторює;
//  - кожен запит має X-Request-Id, POST — Idempotency-Key (тоді повтор безпечний).
//
// Звичайний скрипт (не модуль), щоб сторінка працювала і з file://, і з сервера.

(function (global) {
  'use strict';

  const DEFAULTS = {
    retries: 2,          // скільки разів повторити після першої спроби
    baseDelayMs: 300,    // затримка перед 1-м повтором; далі 600, 1200...
    maxDelayMs: 5000,    // стеля для backoff і Retry-After
    timeoutMs: 3000,     // скільки чекаємо одну спробу
    jitter: true,        // випадкова добавка, щоб клієнти не повторювали синхронно
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const uuid = () => (global.crypto && global.crypto.randomUUID
    ? global.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

  // 300 → 600 → 1200 ... + до 100 мс випадково
  function backoff(baseMs, attempt, jitter, maxMs) {
    const exp = baseMs * 2 ** attempt;
    const extra = jitter ? Math.floor(Math.random() * 100) : 0;
    return Math.min(exp + extra, maxMs);
  }

  // Retry-After буває числом секунд або датою (RFC 9110)
  function retryAfterMs(header, fallbackMs) {
    if (!header) return fallbackMs;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    return Number.isNaN(date) ? fallbackMs : Math.max(0, date - Date.now());
  }

  const isRetryableStatus = (status) => status >= 500 && status <= 599;

  /**
   * fetch з таймаутом і ретраями.
   * opts: звичайні опції fetch + { retry, idempotencyKey, requestId, onAttempt }
   * onAttempt({ attempt, status, error, waitMs, requestId }) — для журналу на сторінці.
   * Повертає Response (останню отриману відповідь) або кидає помилку,
   * якщо всі спроби закінчилися таймаутом/мережевим збоєм.
   */
  async function fetchWithResilience(url, opts = {}) {
    const { retry = {}, idempotencyKey, requestId, onAttempt, ...init } = opts;
    const cfg = { ...DEFAULTS, ...retry };

    const headers = new Headers(init.headers || {});
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    // Один X-Request-Id на всі повтори: у логах сервера видно, що це той самий запит
    const rid = requestId || uuid();
    headers.set('X-Request-Id', rid);

    const report = (info) => { if (onAttempt) onAttempt({ requestId: rid, ...info }); };

    for (let attempt = 0; ; attempt += 1) {
      const canRetry = attempt < cfg.retries;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

      let res;
      try {
        res = await fetch(url, { ...init, headers, signal: controller.signal });
      } catch (e) {
        const error = e.name === 'AbortError' ? `таймаут ${cfg.timeoutMs} мс` : 'мережева помилка';
        if (!canRetry) {
          report({ attempt, error, waitMs: 0 });
          const err = new Error(error);
          err.kind = e.name === 'AbortError' ? 'timeout' : 'network';
          err.requestId = rid;
          throw err;
        }
        const waitMs = backoff(cfg.baseDelayMs, attempt, cfg.jitter, cfg.maxDelayMs);
        report({ attempt, error, waitMs });
        await sleep(waitMs);
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429 && canRetry) {
        const waitMs = Math.min(
          retryAfterMs(res.headers.get('Retry-After'), backoff(cfg.baseDelayMs, attempt, cfg.jitter, cfg.maxDelayMs)),
          cfg.maxDelayMs,
        );
        report({ attempt, status: 429, waitMs });
        await sleep(waitMs);
        continue;
      }

      if (isRetryableStatus(res.status) && canRetry) {
        const waitMs = backoff(cfg.baseDelayMs, attempt, cfg.jitter, cfg.maxDelayMs);
        report({ attempt, status: res.status, waitMs });
        await sleep(waitMs);
        continue;
      }

      report({ attempt, status: res.status, waitMs: 0 });
      return res;
    }
  }

  // Читає тіло помилки у форматі { error, code, details, requestId }.
  // Якщо сервер повернув не JSON — збирає такий самий об'єкт сам.
  async function readError(res) {
    let body = null;
    try { body = await res.json(); } catch (_) { /* не JSON */ }
    return {
      status: res.status,
      error: (body && body.error) || `HTTP ${res.status}`,
      code: (body && body.code) || null,
      details: (body && body.details) || null,
      requestId: (body && body.requestId) || res.headers.get('X-Request-Id'),
    };
  }

  const api = { fetchWithResilience, readError, backoff, retryAfterMs, uuid, DEFAULTS };
  global.StudyHttp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
