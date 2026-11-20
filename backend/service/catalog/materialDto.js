// DTO ресурсу «Матеріал» за docs/api/openapi.yaml: перевірка вхідних даних і мапінг domain → відповідь.

const { MaterialType, TITLE_MAX, DESCRIPTION_MAX, COURSE_MIN, COURSE_MAX } = require('../../domain/catalog/Material');

const QUERY_MAX = 100;
const SORTS = ['new', 'title'];

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isCourse = (v) => Number.isInteger(v) && v >= COURSE_MIN && v <= COURSE_MAX;

// Правила полів тіла запиту. required — код помилки, якщо обов'язкове поле відсутнє.
const FIELD_RULES = {
  title: {
    required: 'TITLE_REQUIRED',
    check: (v) => {
      if (!isNonEmptyString(v)) return ['TITLE_REQUIRED', 'Назва обов\'язкова'];
      if (v.length > TITLE_MAX) return ['TITLE_TOO_LONG', `Назва до ${TITLE_MAX} символів`];
      return null;
    },
  },
  description: {
    check: (v) => {
      if (typeof v !== 'string') return ['INVALID_DESCRIPTION', 'Опис має бути рядком'];
      if (v.length > DESCRIPTION_MAX) return ['DESCRIPTION_TOO_LONG', `Опис до ${DESCRIPTION_MAX} символів`];
      return null;
    },
  },
  subject: {
    required: 'SUBJECT_REQUIRED',
    check: (v) => (isNonEmptyString(v) ? null : ['SUBJECT_REQUIRED', 'Предмет обов\'язковий']),
  },
  university: {
    required: 'UNIVERSITY_REQUIRED',
    check: (v) => (isNonEmptyString(v) ? null : ['UNIVERSITY_REQUIRED', 'Університет обов\'язковий']),
  },
  course: {
    required: 'COURSE_OUT_OF_RANGE',
    check: (v) => (isCourse(v) ? null : ['COURSE_OUT_OF_RANGE', `Курс — ціле число від ${COURSE_MIN} до ${COURSE_MAX}`]),
  },
  type: {
    required: 'INVALID_TYPE',
    check: (v) => (MaterialType.includes(v) ? null : ['INVALID_TYPE', `Тип — одне з: ${MaterialType.join(', ')}`]),
  },
  fileId: {
    required: 'FILE_REQUIRED',
    check: (v) => (isNonEmptyString(v) ? null : ['FILE_REQUIRED', 'Потрібен fileId завантаженого файлу']),
  },
};

const CREATE_FIELDS = ['title', 'description', 'subject', 'university', 'course', 'type', 'fileId'];
const UPDATE_FIELDS = ['title', 'description', 'subject', 'university', 'course', 'type'];

// Повертає список помилок [{ field, message, code }]; порожній список — дані коректні
function validateBody(body, allowed, { partial }) {
  if (!isObject(body)) return [{ field: 'body', code: 'INVALID_BODY', message: 'Тіло запиту має бути JSON-об\'єктом' }];

  const errors = [];
  if (partial && Object.keys(body).length === 0) {
    errors.push({ field: 'body', code: 'EMPTY_UPDATE', message: 'Передайте хоча б одне поле для зміни' });
  }
  for (const field of allowed) {
    const rule = FIELD_RULES[field];
    if (!(field in body)) {
      if (!partial && rule.required) {
        const [code, message] = rule.check(undefined);
        errors.push({ field, code, message });
      }
      continue;
    }
    const problem = rule.check(body[field]);
    if (problem) errors.push({ field, code: problem[0], message: problem[1] });
  }
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) errors.push({ field, code: 'UNKNOWN_FIELD', message: 'Невідоме поле' });
  }
  return errors;
}

const validateCreate = (body) => validateBody(body, CREATE_FIELDS, { partial: false });
const validateUpdate = (body) => validateBody(body, UPDATE_FIELDS, { partial: true });

// Параметри GET /materials приходять рядками; повертає { errors, filters, sort, page }
function parseListQuery(query) {
  const errors = [];
  const filters = {};
  const str = (name) => (query[name] === undefined ? undefined : query[name]);

  const q = str('q');
  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > QUERY_MAX) errors.push({ field: 'q', code: 'QUERY_TOO_LONG', message: `Запит до ${QUERY_MAX} символів` });
    else if (q) filters.q = q;
  }
  for (const name of ['subject', 'university']) {
    const v = str(name);
    if (v === undefined) continue;
    if (typeof v !== 'string') errors.push({ field: name, code: 'INVALID_QUERY', message: 'Очікується один рядок' });
    else if (v) filters[name] = v;
  }
  const course = str('course');
  if (course !== undefined) {
    const n = /^\d+$/.test(course) ? Number(course) : NaN;
    if (!isCourse(n)) errors.push({ field: 'course', code: 'COURSE_OUT_OF_RANGE', message: `Курс — ціле число від ${COURSE_MIN} до ${COURSE_MAX}` });
    else filters.course = n;
  }
  const type = str('type');
  if (type !== undefined) {
    if (!MaterialType.includes(type)) errors.push({ field: 'type', code: 'INVALID_TYPE', message: `Тип — одне з: ${MaterialType.join(', ')}` });
    else filters.type = type;
  }
  const sort = str('sort') ?? 'new';
  if (!SORTS.includes(sort)) errors.push({ field: 'sort', code: 'INVALID_SORT', message: 'sort — new або title' });
  const pageRaw = str('page') ?? '1';
  const page = /^\d+$/.test(pageRaw) ? Number(pageRaw) : NaN;
  if (!(Number.isInteger(page) && page >= 1)) errors.push({ field: 'page', code: 'INVALID_PAGE', message: 'page — ціле число від 1' });

  return { errors, filters, sort, page };
}

// Ідентифікатор зі шляху: додатне ціле або null
function parseId(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  return /^[1-9]\d*$/.test(String(raw)) ? Number(raw) : null;
}

// Material (domain) → MaterialResponse. Внутрішнє поле status не передається.
function toResponse(m) {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    subject: m.subject,
    university: m.university,
    course: m.course,
    type: m.type,
    file: { fileName: m.file.fileName, format: m.file.format, sizeBytes: m.file.sizeBytes, url: m.file.url },
    authorId: m.authorId,
    authorNickname: m.authorNickname,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

module.exports = { validateCreate, validateUpdate, parseListQuery, parseId, toResponse };
