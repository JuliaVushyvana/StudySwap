// Помилки use-case-ів. Сервіс кидає їх, а api/ перетворює на ErrorResponse з потрібним статусом.

class AppError extends Error {
  constructor(error, code, message, details = null) {
    super(message);
    this.error = error;     // категорія з ErrorResponse.error
    this.code = code;       // конкретна причина з ErrorResponse.code
    this.details = details; // [{ field, message }] або null
    this.retryAfter = null; // секунди для заголовка Retry-After або null
  }
}

class ValidationError extends AppError {
  // details: [{ field, message, code }]; code відповіді — код першої помилки
  constructor(details) {
    super('ValidationError', details[0].code, 'Некоректні дані', details.map(({ field, message }) => ({ field, message })));
  }
}

class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Потрібен вхід') {
    super('Unauthorized', code, message);
  }
}

class ForbiddenError extends AppError {
  constructor() {
    super('Forbidden', 'FORBIDDEN', 'Недостатньо прав');
  }
}

class NotFoundError extends AppError {
  constructor(code) {
    super('NotFound', code, 'Не знайдено');
  }
}

class ConflictError extends AppError {
  constructor(code) {
    super('Conflict', code, 'Конфлікт зі станом системи');
  }
}

// Ліміт запитів вичерпано: клієнт може повторити через retryAfter секунд
class TooManyRequestsError extends AppError {
  constructor(retryAfter) {
    super('TooManyRequests', 'RATE_LIMITED', 'Забагато запитів');
    this.retryAfter = retryAfter;
  }
}

// Тимчасова недоступність (таймаут, БД): клієнт може повторити через retryAfter секунд
class ServiceUnavailableError extends AppError {
  constructor(code, retryAfter) {
    super('ServiceUnavailable', code, 'Сервіс тимчасово недоступний');
    this.retryAfter = retryAfter;
  }
}

module.exports = {
  AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError,
  ConflictError, TooManyRequestsError, ServiceUnavailableError,
};
