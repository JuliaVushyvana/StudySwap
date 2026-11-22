// Use-case-и профілю (GET / PATCH /users/me, POST /users/me/password). Частина публічного інтерфейсу модуля access.
// Працює лише із власним акаунтом: user береться з токена, а не з тіла запиту.

const { ValidationError, UnauthorizedError, ConflictError } = require('../errors');
const { validateProfileUpdate, validatePasswordChange, toUserResponse } = require('./authDto');

function createProfileService({ userRepository, passwordHasher }) {
  const requireUser = (user) => {
    if (!user) throw new UnauthorizedError();
    return user;
  };

  // Зайнято кимось іншим (свій же нікнейм залишити можна)
  const takenByOther = (found, user) => found && found.id !== user.id;

  return {
    me(user) {
      return toUserResponse(requireUser(user));
    },

    updateMe(user, body) {
      requireUser(user);
      const errors = validateProfileUpdate(body);
      if (errors.length) throw new ValidationError(errors);

      if ('nickname' in body && takenByOther(userRepository.findByNickname(body.nickname), user)) throw new ConflictError('NICKNAME_TAKEN');
      if ('email' in body && takenByOther(userRepository.findByEmail(body.email), user)) throw new ConflictError('EMAIL_TAKEN');

      if ('nickname' in body) user.nickname = body.nickname.trim();
      if ('email' in body) user.email = body.email.trim();
      userRepository.update(user);
      return toUserResponse(user);
    },

    // Новий пароль — лише якщо правильно вказано поточний
    async changePassword(user, body) {
      requireUser(user);
      const errors = validatePasswordChange(body);
      if (errors.length) throw new ValidationError(errors);

      if (!(await passwordHasher.verify(body.currentPassword, user.passwordHash))) {
        throw new ValidationError([{ field: 'currentPassword', code: 'WRONG_PASSWORD', message: 'Поточний пароль неправильний' }]);
      }
      user.passwordHash = await passwordHasher.hash(body.newPassword);
      userRepository.update(user);
    },
  };
}

module.exports = { createProfileService };
