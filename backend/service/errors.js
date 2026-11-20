// Помилки use-case-ів. Сервіс кидає їх, а api/ перетворює на ErrorResponse з потрібним статусом.

class AppError extends Error {
  constructor(error, code, message, details = null) {
    super(message);
    this.error = error;     // категорія з ErrorResponse.error
    this.code = code;       // конкретна причина з ErrorResponse.code
    this.details = details; // [{ field, message }] або null
  }
}

class ValidationError extends AppError {
  // details: [{ field, message, code }]; code відповіді — код першої помилки
  constructor(details) {
    super('ValidationError', details[0].code, 'Некоректні дані', details.map(({ field, message }) => ({ field, message })));
  }
}

class UnauthorizedError extends AppError {
  constructor() {
    super('Unauthorized', 'UNAUTHORIZED', 'Потрібен вхід');
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

module.exports = { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError };
