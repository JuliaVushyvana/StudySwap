// Піддомен «Користувачі та доступ» (загальний)
// Сутності: User, Role, PasswordResetToken

const Role = Object.freeze({
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
});

const NICKNAME_MIN = 3;
const NICKNAME_MAX = 30;
const LOGIN_MIN = 5;
const LOGIN_MAX = 32;
const EMAIL_MAX = 254;
// Логін без «@»: так вхід за логіном і за поштою не плутаються
const LOGIN_PATTERN = /^[A-Za-z0-9_.-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class User {
  constructor({ id, nickname, login, email, passwordHash, birthDate, avatarUrl = null, role = Role.USER }) {
    if (typeof nickname !== 'string' || nickname.trim().length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
      throw new Error(`nickname має бути від ${NICKNAME_MIN} до ${NICKNAME_MAX} символів`);
    }
    if (typeof login !== 'string' || login.length < LOGIN_MIN || login.length > LOGIN_MAX) {
      throw new Error(`login має бути від ${LOGIN_MIN} до ${LOGIN_MAX} символів`);
    }
    if (!LOGIN_PATTERN.test(login)) {
      throw new Error('login може містити лише латинські літери, цифри та символи _ . -');
    }
    if (typeof email !== 'string' || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
      throw new Error('Некоректний email');
    }
    if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime()) || birthDate >= new Date()) {
      throw new Error('birthDate має бути в минулому');
    }
    if (!Object.values(Role).includes(role) || role === Role.GUEST) {
      throw new Error('Некоректна роль');
    }
    this.id = id;
    this.nickname = nickname;
    this.login = login;
    this.email = email;
    this.passwordHash = passwordHash;
    this.birthDate = birthDate;
    this.avatarUrl = avatarUrl;
    this.role = role;
    this.isBlocked = false; // після блокування акаунт видаляється остаточно
  }

  // Реєстрація завжди створює звичайного користувача: роль із запиту не приймається
  static register({ nickname, login, email, passwordHash, birthDate }) {
    return new User({ nickname, login, email, passwordHash, birthDate, role: Role.USER });
  }

  isAdmin() {
    return this.role === Role.ADMIN;
  }

  // Публікувати, коментувати й скаржитися може лише незаблокований користувач
  canPublish() {
    return this.role !== Role.GUEST && !this.isBlocked;
  }

  // Блокування = остаточне видалення акаунта порушника (див. glossary.md, термін 10)
  block(admin) {
    if (!admin.isAdmin()) throw new Error('Блокувати може лише адмін'); // 403
    if (this.isAdmin()) throw new Error('Адміна заблокувати не можна');
    if (this.isBlocked) throw new Error('Користувача вже заблоковано'); // 409
    this.isBlocked = true;
  }
}

const RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // діє не довше 5 хв

class PasswordResetToken {
  constructor({ tokenHash, userId, createdAt = new Date() }) {
    this.tokenHash = tokenHash;
    this.userId = userId;
    this.createdAt = createdAt;
    this.expiresAt = new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS);
    this.usedAt = null;
  }

  isValid(now = new Date()) {
    return this.usedAt === null && now < this.expiresAt;
  }

  // Токен одноразовий
  use(now = new Date()) {
    if (!this.isValid(now)) throw new Error('Посилання недійсне або вже використане');
    this.usedAt = now;
  }
}

module.exports = {
  User, Role, PasswordResetToken,
  NICKNAME_MIN, NICKNAME_MAX, LOGIN_MIN, LOGIN_MAX, EMAIL_MAX, LOGIN_PATTERN, EMAIL_PATTERN,
};
