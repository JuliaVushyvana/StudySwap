// Юніт-тести суперадміна: список користувачів і призначення ролі адміна. Репозиторій — фейк у пам'яті.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRoleService } = require('../../service/access/roleService');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../../service/errors');
const { User, Role } = require('../../domain/access/User');
const { can, Permission } = require('../../domain/access/permissions');

const born = new Date('2005-03-14');
const mk = (id, nickname, role = Role.USER) => Object.assign(
  new User({ nickname, login: `${nickname.toLowerCase()}_x`, email: `${id}@uni.ua`, passwordHash: 'x', birthDate: born, role }), { id },
);

function setup() {
  const users = [mk(1, 'Super', Role.SUPERADMIN), mk(2, 'Admin', Role.ADMIN), mk(3, 'Anna'), mk(4, 'Julia')];
  const userRepository = {
    findById: (id) => users.find((u) => u.id === id) || null,
    search: (q) => users.filter((u) => u.nickname.toLowerCase().includes(q.toLowerCase())),
    update: () => {},
  };
  return { service: createRoleService({ userRepository }), users };
}

test('суперадмін має всі права адміна + керування ролями; адмін — ні', () => {
  const { users: [superadmin, admin] } = setup();
  assert.equal(superadmin.isAdmin(), true);
  assert.equal(can(superadmin, Permission.MATERIAL_DELETE_ANY), true);
  assert.equal(can(superadmin, Permission.USER_ROLE_MANAGE), true);
  assert.equal(can(admin, Permission.USER_ROLE_MANAGE), false);
});

test('суперадмін призначає адміна і знімає його', () => {
  const { service, users: [superadmin, , anna] } = setup();
  assert.equal(service.setRole(superadmin, 3, { role: 'admin' }).role, 'admin');
  assert.equal(anna.isAdmin(), true);
  assert.equal(service.setRole(superadmin, 3, { role: 'user' }).role, 'user');
});

test('адмін і користувач не можуть призначати ролі → 403, гість → 401', () => {
  const { service, users: [, admin, anna] } = setup();
  assert.throws(() => service.setRole(admin, 4, { role: 'admin' }), ForbiddenError);
  assert.throws(() => service.setRole(anna, 4, { role: 'admin' }), ForbiddenError);
  assert.throws(() => service.setRole(null, 4, { role: 'admin' }), UnauthorizedError);
  assert.throws(() => service.list(admin), ForbiddenError);
});

test('заборонено: призначити суперадміна, змінити себе чи іншого суперадміна, невідомий id', () => {
  const { service, users: [superadmin] } = setup();
  assert.throws(() => service.setRole(superadmin, 3, { role: 'superadmin' }), (e) => e instanceof ValidationError && e.code === 'INVALID_ROLE');
  assert.throws(() => service.setRole(superadmin, 1, { role: 'user' }), ForbiddenError);
  assert.throws(() => service.setRole(superadmin, 99, { role: 'admin' }), NotFoundError);
});

test('list: пошук користувачів для суперадміна, без паролів', () => {
  const { service, users: [superadmin] } = setup();
  const { items } = service.list(superadmin, { q: 'an' });
  assert.deepEqual(items.map((u) => u.nickname), ['Anna']);
  assert.equal('passwordHash' in items[0], false);
});
