// DTO ресурсу «Акаунт» за docs/api/openapi.yaml: перевірка тіла /auth/* і мапінг User → відповідь без passwordHash.

const {
  NICKNAME_MIN, NICKNAME_MAX, LOGIN_MIN, LOGIN_MAX, EMAIL_MAX, LOGIN_PATTERN, EMAIL_PATTERN,
} = require('../../domain/access/User');

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ігнорує все, що довше 72 байт

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

// 'YYYY-MM-DD' → Date або null (31 лютого теж null)
function parseDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v ? date : null;
}

const checkPassword = (v) => {
  if (!isNonEmptyString(v)) return ['PASSWORD_REQUIRED', 'Пароль обов\'язковий'];
  if (v.length < PASSWORD_MIN) return ['PASSWORD_TOO_SHORT', `Пароль щонайменше ${PASSWORD_MIN} символів`];
  if (Buffer.byteLength(v, 'utf8') > PASSWORD_MAX_BYTES) return ['PASSWORD_TOO_LONG', `Пароль до ${PASSWORD_MAX_BYTES} байт`];
  return null;
};

const REGISTER_RULES = {
  nickname: (v) => {
    if (!isNonEmptyString(v)) return ['NICKNAME_REQUIRED', 'Нікнейм обов\'язковий'];
    if (v.trim().length < NICKNAME_MIN || v.length > NICKNAME_MAX) return ['INVALID_NICKNAME', `Нікнейм від ${NICKNAME_MIN} до ${NICKNAME_MAX} символів`];
    return null;
  },
  login: (v) => {
    if (!isNonEmptyString(v)) return ['LOGIN_REQUIRED', 'Логін обов\'язковий'];
    if (v.length < LOGIN_MIN || v.length > LOGIN_MAX) return ['INVALID_LOGIN', `Логін від ${LOGIN_MIN} до ${LOGIN_MAX} символів`];
    if (!LOGIN_PATTERN.test(v)) return ['INVALID_LOGIN', 'Логін: латинські літери, цифри та символи _ . -'];
    return null;
  },
  email: (v) => {
    if (!isNonEmptyString(v)) return ['EMAIL_REQUIRED', 'Пошта обов\'язкова'];
    if (v.length > EMAIL_MAX || !EMAIL_PATTERN.test(v)) return ['INVALID_EMAIL', 'Некоректна пошта'];
    return null;
  },
  password: checkPassword,
  birthDate: (v, now) => {
    if (v === undefined || v === null || v === '') return ['BIRTH_DATE_REQUIRED', 'Дата народження обов\'язкова'];
    const date = parseDate(v);
    if (!date) return ['INVALID_BIRTH_DATE', 'Дата у форматі YYYY-MM-DD'];
    if (date >= now) return ['INVALID_BIRTH_DATE', 'Дата народження має бути в минулому'];
    return null;
  },
};

// Під час входу довжину пароля не перевіряємо: інакше відповідь підказує правила, а не «невірний пароль»
const LOGIN_RULES = {
  login: (v) => (isNonEmptyString(v) ? null : ['LOGIN_REQUIRED', 'Вкажіть логін або пошту']),
  password: (v) => (isNonEmptyString(v) ? null : ['PASSWORD_REQUIRED', 'Пароль обов\'язковий']),
};

// Повертає список помилок [{ field, message, code }]; порожній список — дані коректні
function validate(body, rules, now) {
  if (!isObject(body)) return [{ field: 'body', code: 'INVALID_BODY', message: 'Тіло запиту має бути JSON-об\'єктом' }];
  const errors = [];
  for (const [field, check] of Object.entries(rules)) {
    const problem = check(body[field], now);
    if (problem) errors.push({ field, code: problem[0], message: problem[1] });
  }
  // role теж сюди потрапляє: роль при реєстрації завжди user
  for (const field of Object.keys(body)) {
    if (!(field in rules)) errors.push({ field, code: 'UNKNOWN_FIELD', message: 'Невідоме поле' });
  }
  return errors;
}

const validateRegister = (body, now = new Date()) => validate(body, REGISTER_RULES, now);

// PATCH /users/me: можна змінити нікнейм і пошту (логін і роль — ні); потрібне хоча б одне поле
function validateProfileUpdate(body) {
  if (!isObject(body)) return [{ field: 'body', code: 'INVALID_BODY', message: 'Тіло запиту має бути JSON-об\'єктом' }];
  const rules = { nickname: REGISTER_RULES.nickname, email: REGISTER_RULES.email };
  const present = Object.fromEntries(Object.entries(rules).filter(([field]) => field in body));
  const errors = Object.keys(present).length
    ? validate(body, present)
    : [{ field: 'body', code: 'EMPTY_UPDATE', message: 'Передайте nickname або email' }];
  for (const field of Object.keys(body)) {
    if (!(field in rules) && !errors.some((e) => e.field === field)) errors.push({ field, code: 'UNKNOWN_FIELD', message: 'Змінити можна лише nickname і email' });
  }
  return errors;
}

// POST /users/me/password
const validatePasswordChange = (body) => validate(body, {
  currentPassword: (v) => (isNonEmptyString(v) ? null : ['PASSWORD_REQUIRED', 'Вкажіть поточний пароль']),
  newPassword: checkPassword,
});
const validateLogin = (body) => validate(body, LOGIN_RULES);

// User (domain) → UserResponse. passwordHash і isBlocked назовні не віддаються.
function toUserResponse(u) {
  return {
    id: u.id,
    nickname: u.nickname,
    login: u.login,
    email: u.email,
    birthDate: u.birthDate.toISOString().slice(0, 10),
    avatarUrl: u.avatarUrl,
    role: u.role,
  };
}

module.exports = {
  validateRegister, validateLogin, validateProfileUpdate, validatePasswordChange, parseDate, toUserResponse, PASSWORD_MIN,
};
