// Use-case-и суперадміна: список користувачів і призначення / зняття ролі адміна.
// GET /users?q=…  і  PATCH /users/{id}/role. Частина публічного інтерфейсу модуля access.

const { ASSIGNABLE_ROLES } = require('../../domain/access/User');
const { Permission, can } = require('../../domain/access/permissions');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../errors');
const { toUserResponse } = require('./authDto');

const QUERY_MAX = 100;

function createRoleService({ userRepository }) {
  // Гість → 401, увійшов, але не суперадмін → 403
  const requireRoleManager = (actor) => {
    if (!actor) throw new UnauthorizedError();
    if (!can(actor, Permission.USER_ROLE_MANAGE)) throw new ForbiddenError();
  };

  return {
    list(actor, query = {}) {
      requireRoleManager(actor);
      const q = typeof query.q === 'string' ? query.q.trim() : '';
      if (q.length > QUERY_MAX) throw new ValidationError([{ field: 'q', code: 'QUERY_TOO_LONG', message: `Запит до ${QUERY_MAX} символів` }]);
      const items = userRepository.search(q).map(toUserResponse);
      return { items, total: items.length };
    },

    setRole(actor, rawId, body) {
      requireRoleManager(actor);
      const role = body && body.role;
      if (!ASSIGNABLE_ROLES.includes(role)) {
        throw new ValidationError([{ field: 'role', code: 'INVALID_ROLE', message: `Роль — одна з: ${ASSIGNABLE_ROLES.join(', ')}` }]);
      }
      const id = Number(rawId);
      const target = Number.isInteger(id) && id > 0 ? userRepository.findById(id) : null;
      if (!target || target.isBlocked) throw new NotFoundError('USER_NOT_FOUND');
      if (target.id === actor.id || target.isSuperAdmin()) throw new ForbiddenError(); // себе й суперадміна не змінюємо

      target.assignRole(actor, role);
      userRepository.update(target);
      return toUserResponse(target);
    },
  };
}

module.exports = { createRoleService };
