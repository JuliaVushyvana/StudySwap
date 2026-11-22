// Рівні доступу StudySwap: гість, користувач, адмін і суперадмін (адмін + призначення адмінів).
// Єдина матриця прав: її використовують сервіси (бекенд) і дзеркально frontend/lib/permissions.js (лише для показу кнопок).
// Чистий JavaScript без Express і БД, тож правила легко тестувати.

const { Role } = require('./User');

const Permission = Object.freeze({
  MATERIAL_LIST: 'material:list',             // бачити каталог (таблицю)
  MATERIAL_READ: 'material:read',             // відкрити сторінку матеріалу (опис, автор, дата)
  FILE_PREVIEW: 'file:preview',               // переглянути PDF / Word / TXT на сайті (без скачування)
  FILE_READ: 'file:read',                     // скачати файл матеріалу
  COMMENT_CREATE: 'comment:create',           // писати коментарі (модуль обговорення — пізніше)
  MATERIAL_CREATE: 'material:create',         // додати матеріал
  MATERIAL_UPDATE_OWN: 'material:update:own', // змінити свій матеріал
  MATERIAL_DELETE_OWN: 'material:delete:own', // видалити свій матеріал
  MATERIAL_UPDATE_ANY: 'material:update:any', // змінити будь-який матеріал
  MATERIAL_DELETE_ANY: 'material:delete:any', // видалити будь-який матеріал
  REPORT_REVIEW: 'report:review',             // розглядати скарги (Пізніше)
  USER_BLOCK: 'user:block',                   // блокувати порушників (Пізніше)
  USER_ROLE_MANAGE: 'user:role:manage',       // бачити користувачів і призначати / знімати адмінів
});

const P = Permission;
// Гість бачить каталог, сторінку матеріалу й перегляд документа на сайті, але не скачує файл і не коментує
// (business_doc №10: писати коментарі — лише зареєстровані)
const GUEST = [P.MATERIAL_LIST, P.MATERIAL_READ, P.FILE_PREVIEW];
const USER = [...GUEST, P.FILE_READ, P.COMMENT_CREATE, P.MATERIAL_CREATE, P.MATERIAL_UPDATE_OWN, P.MATERIAL_DELETE_OWN];
const ADMIN = [...USER, P.MATERIAL_UPDATE_ANY, P.MATERIAL_DELETE_ANY, P.REPORT_REVIEW, P.USER_BLOCK];
const SUPERADMIN = [...ADMIN, P.USER_ROLE_MANAGE];

const ROLE_PERMISSIONS = Object.freeze({
  [Role.GUEST]: Object.freeze(GUEST),
  [Role.USER]: Object.freeze(USER),
  [Role.ADMIN]: Object.freeze(ADMIN),
  [Role.SUPERADMIN]: Object.freeze(SUPERADMIN),
});

// Рівень доступу того, хто робить запит. Немає користувача або його заблоковано → гість.
function roleOf(user) {
  if (!user || user.isBlocked) return Role.GUEST;
  return ROLE_PERMISSIONS[user.role] ? user.role : Role.GUEST;
}

function can(user, permission) {
  return ROLE_PERMISSIONS[roleOf(user)].includes(permission);
}

// Змінити / видалити матеріал: «будь-який» (адмін) або «свій» (автор)
function canManageMaterial(user, material, action) {
  const any = action === 'delete' ? P.MATERIAL_DELETE_ANY : P.MATERIAL_UPDATE_ANY;
  const own = action === 'delete' ? P.MATERIAL_DELETE_OWN : P.MATERIAL_UPDATE_OWN;
  if (can(user, any)) return true;
  return can(user, own) && user.id === material.authorId;
}

module.exports = { Permission, ROLE_PERMISSIONS, roleOf, can, canManageMaterial };
