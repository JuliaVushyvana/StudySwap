// Use-case-и реєстрації, входу й виходу (POST /auth/*). Частина публічного інтерфейсу модуля access.

const { User } = require('../../domain/access/User');
const { ValidationError, UnauthorizedError, ConflictError } = require('../errors');
const { validateRegister, validateLogin, parseDate, toUserResponse } = require('./authDto');

function createIdentityService({ userRepository, passwordHasher, tokenService, now = () => new Date() }) {
  // Хеш-заглушка: для неіснуючого логіна теж рахуємо bcrypt, щоб за часом відповіді
  // не можна було дізнатися, які логіни зареєстровані
  let dummyHash = null;
  const getDummyHash = () => {
    dummyHash ??= passwordHasher.hash('dummy-password-for-timing');
    return dummyHash;
  };

  const findForLogin = (loginOrEmail) => (loginOrEmail.includes('@')
    ? userRepository.findByEmail(loginOrEmail)
    : userRepository.findByLogin(loginOrEmail));

  return {
    async register(body) {
      const errors = validateRegister(body, now());
      if (errors.length) throw new ValidationError(errors);

      // Дешева перевірка до bcrypt; гонку двох однакових реєстрацій ловить UNIQUE-індекс у репозиторії
      if (userRepository.findByLogin(body.login)) throw new ConflictError('LOGIN_TAKEN');
      if (userRepository.findByNickname(body.nickname)) throw new ConflictError('NICKNAME_TAKEN');
      if (userRepository.findByEmail(body.email)) throw new ConflictError('EMAIL_TAKEN');

      const user = User.register({
        nickname: body.nickname, login: body.login, email: body.email,
        passwordHash: await passwordHasher.hash(body.password),
        birthDate: parseDate(body.birthDate),
      });
      user.id = userRepository.insert(user);
      return toUserResponse(user);
    },

    // Вхід за логіном або поштою. Неіснуючий акаунт і неправильний пароль — однакова 401
    async login(body) {
      const errors = validateLogin(body);
      if (errors.length) throw new ValidationError(errors);

      const user = findForLogin(body.login);
      const matches = await passwordHasher.verify(body.password, user ? user.passwordHash : await getDummyHash());
      if (!user || !matches || user.isBlocked) throw new UnauthorizedError('INVALID_CREDENTIALS', 'Неправильний логін або пароль');

      const { token, expiresIn } = tokenService.issue(user);
      return { accessToken: token, tokenType: 'Bearer', expiresIn, user: toUserResponse(user) };
    },

    // Після виходу цей токен більше не приймається
    logout(user, token) {
      if (!user || !tokenService.revoke(token)) throw new UnauthorizedError();
    },
  };
}

module.exports = { createIdentityService };
