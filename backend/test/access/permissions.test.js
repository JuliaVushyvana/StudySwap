// Юніт-тести матриці прав: три рівні доступу (гість, користувач, адмін).

const test = require('node:test');
const assert = require('node:assert/strict');

const { Permission: P, roleOf, can, canManageMaterial } = require('../../domain/access/permissions');
const { User, Role } = require('../../domain/access/User');

const born = new Date('2005-03-14');
const user = (id, role = Role.USER) => Object.assign(
  new User({ nickname: `User${id}`, login: `user_${id}`, email: `u${id}@uni.ua`, passwordHash: 'x', birthDate: born, role }),
  { id },
);
const anna = user(1);
const julia = user(2);
const admin = user(3, Role.ADMIN);
const annasMaterial = { authorId: anna.id };

test('roleOf: немає користувача або заблокований → гість', () => {
  assert.equal(roleOf(null), Role.GUEST);
  assert.equal(roleOf(Object.assign(user(9), { isBlocked: true })), Role.GUEST);
  assert.equal(roleOf(anna), Role.USER);
  assert.equal(roleOf(admin), Role.ADMIN);
});

test('гість: лише каталог', () => {
  assert.equal(can(null, P.MATERIAL_LIST), true);
  assert.equal(can(null, P.MATERIAL_READ), false);
  assert.equal(can(null, P.MATERIAL_CREATE), false);
  assert.equal(canManageMaterial(null, annasMaterial, 'delete'), false);
});

test('користувач: відкриває й додає, змінює/видаляє лише своє', () => {
  assert.equal(can(julia, P.MATERIAL_READ), true);
  assert.equal(can(julia, P.MATERIAL_CREATE), true);
  assert.equal(canManageMaterial(anna, annasMaterial, 'update'), true);
  assert.equal(canManageMaterial(anna, annasMaterial, 'delete'), true);
  assert.equal(canManageMaterial(julia, annasMaterial, 'update'), false);
  assert.equal(canManageMaterial(julia, annasMaterial, 'delete'), false);
  assert.equal(can(julia, P.USER_BLOCK), false);
});

test('адмін: усе, зокрема чужі матеріали й модерація', () => {
  assert.equal(canManageMaterial(admin, annasMaterial, 'update'), true);
  assert.equal(canManageMaterial(admin, annasMaterial, 'delete'), true);
  assert.equal(can(admin, P.REPORT_REVIEW), true);
  assert.equal(can(admin, P.USER_BLOCK), true);
});
