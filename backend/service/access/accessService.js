// Публічний інтерфейс модуля access для інших модулів і api/.

// Тимчасові токени для розробки: справжній вхід (POST /auth/login, JWT) з'явиться окремою задачею.
// Ключ — токен із заголовка Authorization: Bearer <токен>, значення — User.id.
const DEV_TOKENS = Object.freeze({
  'dev-token-anna': 1,
  'dev-token-ivan': 2,
  'dev-token-admin': 3,
});

function createAccessService({ userRepository, tokens = DEV_TOKENS }) {
  return {
    // Повертає User за токеном або null, якщо токен невідомий чи користувача заблоковано
    authenticate(token) {
      const userId = token && tokens[token];
      if (!userId) return null;
      const user = userRepository.findById(userId);
      return user && !user.isBlocked ? user : null;
    },
  };
}

module.exports = { createAccessService, DEV_TOKENS };
