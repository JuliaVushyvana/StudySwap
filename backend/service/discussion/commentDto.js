// DTO ресурсу «Коментар» за docs/api/openapi.yaml: перевірка тіла запиту й мапінг domain → відповідь.

const TEXT_MAX = 1000;

// Повертає список помилок [{ field, message, code }]; порожній список — дані коректні
function validateCreate(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [{ field: 'body', code: 'INVALID_BODY', message: 'Тіло запиту має бути JSON-об\'єктом' }];
  }
  const errors = [];
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) errors.push({ field: 'text', code: 'TEXT_REQUIRED', message: 'Текст коментаря обов\'язковий' });
  else if (text.length > TEXT_MAX) errors.push({ field: 'text', code: 'TEXT_TOO_LONG', message: `Коментар до ${TEXT_MAX} символів` });
  for (const field of Object.keys(body)) {
    if (field !== 'text') errors.push({ field, code: 'UNKNOWN_FIELD', message: 'Невідоме поле' });
  }
  return errors;
}

// Ідентифікатор зі шляху: додатне ціле або null
const parseId = (raw) => (/^[1-9]\d*$/.test(String(raw)) ? Number(raw) : null);

// Comment (domain) → CommentResponse
function toResponse(c, materialId) {
  return {
    id: c.id,
    materialId,
    authorId: c.authorId,
    authorNickname: c.authorNickname,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
  };
}

module.exports = { validateCreate, parseId, toResponse, TEXT_MAX };
