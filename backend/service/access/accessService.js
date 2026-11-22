// Публічний інтерфейс модуля access для інших модулів і api/: хто робить запит.

function createAccessService({ userRepository, tokenService }) {
  return {
    // Повертає User за JWT або null, якщо токен недійсний, відкликаний чи користувача заблоковано
    authenticate(token) {
      const payload = tokenService.verify(token);
      if (!payload) return null;
      const user = userRepository.findById(payload.userId);
      return user && !user.isBlocked ? user : null;
    },
  };
}

module.exports = { createAccessService };
