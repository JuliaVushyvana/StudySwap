// Публічний інтерфейс модуля access для інших модулів і api/: хто робить запит і що йому дозволено.
// Інші модулі (catalog, storage) питають права тут, а не імпортують domain/access напряму (ADR-0001, ADR-0002).

const { Permission, can, canManageMaterial } = require('../../domain/access/permissions');

function createAccessService({ userRepository, tokenService }) {
  return {
    // Повертає User за JWT або null, якщо токен недійсний, відкликаний чи користувача заблоковано
    authenticate(token) {
      const payload = tokenService.verify(token);
      if (!payload) return null;
      const user = userRepository.findById(payload.userId);
      return user && !user.isBlocked ? user : null;
    },

    // Актуальний нікнейм користувача (для показу автора матеріалу) або null, якщо акаунта немає
    nicknameOf(userId) {
      const user = userRepository.findById(userId);
      return user ? user.nickname : null;
    },
  };
}

// Права за трьома рівнями доступу (гість / користувач / адмін). Не потребують БД,
// тому доступні окремо від authenticate — їх отримують сервіси інших модулів.
const accessPolicy = Object.freeze({ Permission, can, canManageMaterial });

module.exports = { createAccessService, accessPolicy };
