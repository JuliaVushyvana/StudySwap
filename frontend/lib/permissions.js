// Рівні доступу на фронтенді (гість / користувач / адмін / суперадмін) — дзеркало backend/domain/access/permissions.js.
// Лише для зручності: ховає кнопки, яких немає права натискати, і веде гостя на вхід.
// Справжній захист — на сервері (401 / 403), тож зміна цього файлу нічого не відкриє.

(function (global) {
  'use strict';

  const P = Object.freeze({
    MATERIAL_LIST: 'material:list',
    MATERIAL_READ: 'material:read',
    FILE_PREVIEW: 'file:preview',
    FILE_READ: 'file:read',
    COMMENT_CREATE: 'comment:create',
    MATERIAL_CREATE: 'material:create',
    MATERIAL_UPDATE_OWN: 'material:update:own',
    MATERIAL_DELETE_OWN: 'material:delete:own',
    MATERIAL_UPDATE_ANY: 'material:update:any',
    MATERIAL_DELETE_ANY: 'material:delete:any',
    COMMENT_DELETE_ANY: 'comment:delete:any',
    USER_ROLE_MANAGE: 'user:role:manage',
  });

  // Гість бачить каталог, сторінку матеріалу й перегляд документа, але не скачує файл і не коментує
  const GUEST = [P.MATERIAL_LIST, P.MATERIAL_READ, P.FILE_PREVIEW];
  const USER = [...GUEST, P.FILE_READ, P.COMMENT_CREATE, P.MATERIAL_CREATE, P.MATERIAL_UPDATE_OWN, P.MATERIAL_DELETE_OWN];
  const ADMIN = [...USER, P.MATERIAL_UPDATE_ANY, P.MATERIAL_DELETE_ANY, P.COMMENT_DELETE_ANY];
  const SUPERADMIN = [...ADMIN, P.USER_ROLE_MANAGE];
  const ROLES = { guest: GUEST, user: USER, admin: ADMIN, superadmin: SUPERADMIN };

  const LABELS = { guest: 'Гість', user: 'Користувач', admin: 'Адмін', superadmin: 'Суперадмін' };

  // user — з відповіді POST /auth/login ({ id, nickname, role }) або null для гостя
  const roleOf = (user) => (user && ROLES[user.role] ? user.role : 'guest');
  const can = (user, permission) => ROLES[roleOf(user)].includes(permission);

  function canManageMaterial(user, material, action) {
    const any = action === 'delete' ? P.MATERIAL_DELETE_ANY : P.MATERIAL_UPDATE_ANY;
    const own = action === 'delete' ? P.MATERIAL_DELETE_OWN : P.MATERIAL_UPDATE_OWN;
    if (can(user, any)) return true;
    return can(user, own) && user.id === material.authorId;
  }

  // Адмін-можливості (усі матеріали, модерація) мають і адмін, і суперадмін
  const isAdmin = (user) => can(user, P.MATERIAL_DELETE_ANY);

  global.StudyAccess = {
    Permission: P, roleOf, can, canManageMaterial, isAdmin,
    label: (user) => LABELS[roleOf(user)],
    roleLabel: (role) => LABELS[role] || role,
  };
}(window));
