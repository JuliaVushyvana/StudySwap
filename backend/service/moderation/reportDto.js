// DTO ресурсу «Скарга» за docs/api/openapi.yaml: перевірка вхідних даних і мапінг domain → відповідь.

const { ReportStatus } = require('../../domain/moderation/Report');

const TEXT_MAX = 1000;
const COMMENT_MAX = 500;
const RESULTS = [ReportStatus.RESOLVED, ReportStatus.REJECTED];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const INVALID_BODY = [{ field: 'body', code: 'INVALID_BODY', message: 'Тіло запиту має бути JSON-об\'єктом' }];

// Додатне ціле: число з JSON або рядок зі шляху; інакше null
const parseId = (raw) => {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  return /^[1-9]\d*$/.test(String(raw)) ? Number(raw) : null;
};

function unknownFields(body, allowed) {
  return Object.keys(body).filter((f) => !allowed.includes(f)).map((field) => ({ field, code: 'UNKNOWN_FIELD', message: 'Невідоме поле' }));
}

// Повертають список помилок [{ field, message, code }]; порожній список — дані коректні
function validateCreate(body) {
  if (!isObject(body)) return INVALID_BODY;
  const errors = [];
  if (!parseId(body.materialId) || typeof body.materialId !== 'number') {
    errors.push({ field: 'materialId', code: 'MATERIAL_REQUIRED', message: 'Вкажіть матеріал (materialId — ціле число)' });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) errors.push({ field: 'text', code: 'TEXT_REQUIRED', message: 'Опишіть, що не так із матеріалом' });
  else if (text.length > TEXT_MAX) errors.push({ field: 'text', code: 'TEXT_TOO_LONG', message: `Скарга до ${TEXT_MAX} символів` });
  return [...errors, ...unknownFields(body, ['materialId', 'text'])];
}

function validateDecision(body) {
  if (!isObject(body)) return INVALID_BODY;
  const errors = [];
  if (!RESULTS.includes(body.result)) {
    errors.push({ field: 'result', code: 'INVALID_RESULT', message: 'result — resolved (задовольнити) або rejected (відхилити)' });
  }
  if (body.deleteMaterial !== undefined) {
    if (typeof body.deleteMaterial !== 'boolean') {
      errors.push({ field: 'deleteMaterial', code: 'INVALID_DELETE_MATERIAL', message: 'deleteMaterial — true або false' });
    } else if (body.deleteMaterial && body.result === ReportStatus.REJECTED) {
      errors.push({ field: 'deleteMaterial', code: 'INVALID_DELETE_MATERIAL', message: 'Видалити матеріал можна лише разом із задоволенням скарги' });
    }
  }
  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.trim().length > COMMENT_MAX)) {
    errors.push({ field: 'comment', code: 'COMMENT_TOO_LONG', message: `Коментар — рядок до ${COMMENT_MAX} символів` });
  }
  return [...errors, ...unknownFields(body, ['result', 'deleteMaterial', 'comment'])];
}

// Параметри GET /reports: { errors, status, page }
function parseListQuery(query) {
  const errors = [];
  const { status } = query;
  if (status !== undefined && !Object.values(ReportStatus).includes(status)) {
    errors.push({ field: 'status', code: 'INVALID_STATUS', message: 'status — open, resolved або rejected' });
  }
  const pageRaw = query.page ?? '1';
  const page = /^[1-9]\d*$/.test(String(pageRaw)) ? Number(pageRaw) : NaN;
  if (!Number.isInteger(page)) errors.push({ field: 'page', code: 'INVALID_PAGE', message: 'page — ціле число від 1' });
  return { errors, status, page };
}

// Report (domain) → ReportResponse
function toResponse(r) {
  return {
    id: r.id,
    materialId: r.materialId,
    materialTitle: r.materialTitle,
    materialAuthorId: r.materialAuthorId,
    materialAuthorNickname: r.materialAuthorNickname,
    reporterId: r.reporterId,
    reporterNickname: r.reporterNickname,
    text: r.text,
    status: r.status,
    decision: r.decision && r.reviewedAt
      ? { deleteMaterial: r.decision.deleteMaterial, comment: r.decision.comment, reviewerId: r.reviewerId, reviewedAt: r.reviewedAt.toISOString() }
      : null,
    createdAt: r.createdAt.toISOString(),
  };
}

module.exports = { validateCreate, validateDecision, parseListQuery, parseId, toResponse, TEXT_MAX, COMMENT_MAX };
