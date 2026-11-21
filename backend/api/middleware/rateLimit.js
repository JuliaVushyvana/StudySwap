// Обмеження кількості запитів з однієї IP-адреси у фіксованому вікні. Понад ліміт → 429 з Retry-After.

const { TooManyRequestsError } = require('../../service/errors');

const PRUNE_AT = 10_000; // скільки адрес тримати, перш ніж прибрати прострочені вікна

function createRateLimiter({ windowMs, max, now = Date.now }) {
  const windows = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const t = now();
    // req.ip враховує X-Forwarded-For лише якщо в Express увімкнено trust proxy, тож заголовок не підробити
    let win = windows.get(req.ip);
    if (!win || t >= win.resetAt) {
      if (windows.size >= PRUNE_AT) {
        for (const [ip, w] of windows) if (t >= w.resetAt) windows.delete(ip);
      }
      win = { count: 0, resetAt: t + windowMs };
      windows.set(req.ip, win);
    }
    win.count += 1;
    if (win.count > max) return next(new TooManyRequestsError(Math.max(1, Math.ceil((win.resetAt - t) / 1000))));
    next();
  };
}

module.exports = { createRateLimiter };
