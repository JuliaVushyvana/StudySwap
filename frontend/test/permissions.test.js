// Тести lib/permissions.js: права фронтенду мають збігатися з матрицею бекенду (ADR-0005).

const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.window = globalThis; // бібліотека підключається на сторінці й реєструє себе у window
require('../lib/permissions.js');
const { can, canManageMaterial, roleOf, label, Permission: P } = globalThis.StudyAccess;

const anna = { id: 1, role: 'user' };
const julia = { id: 2, role: 'user' };
const admin = { id: 3, role: 'admin' };
const superadmin = { id: 4, role: 'superadmin' };
const annasMaterial = { authorId: 1 };

test('гість: каталог, сторінка матеріалу й перегляд файлу; без скачування, додавання й коментарів', () => {
  assert.equal(roleOf(null), 'guest');
  assert.equal(can(null, P.MATERIAL_READ), true);
  assert.equal(can(null, P.FILE_PREVIEW), true);
  assert.equal(can(null, P.FILE_READ), false);
  assert.equal(can(null, P.MATERIAL_CREATE), false);
  assert.equal(can(null, P.COMMENT_CREATE), false);
});

test('користувач: скачує й додає, змінює лише своє', () => {
  assert.equal(can(julia, P.FILE_READ), true);
  assert.equal(canManageMaterial(anna, annasMaterial, 'delete'), true);
  assert.equal(canManageMaterial(julia, annasMaterial, 'delete'), false);
  assert.equal(can(julia, P.COMMENT_DELETE_ANY), false);
});

test('адмін керує всіма матеріалами; ролі призначає лише суперадмін', () => {
  assert.equal(canManageMaterial(admin, annasMaterial, 'update'), true);
  assert.equal(can(admin, P.USER_ROLE_MANAGE), false);
  assert.equal(can(superadmin, P.USER_ROLE_MANAGE), true);
  assert.equal(can(admin, P.COMMENT_DELETE_ANY), true);
  assert.equal(can(superadmin, P.COMMENT_DELETE_ANY), true);
  assert.equal(label(superadmin), 'Суперадмін');
});

test('невідома роль вважається гостем', () => {
  assert.equal(roleOf({ id: 9, role: 'hacker' }), 'guest');
  assert.equal(can({ id: 9, role: 'hacker' }, P.MATERIAL_CREATE), false);
});
