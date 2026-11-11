// Піддомен «Користувачі та доступ» (загальний)
// Сутності: User, Role, PasswordResetToken

const Role = Object.freeze({
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
});

class User {
  constructor({ id, nickname, login, email, passwordHash, birthDate, avatarUrl = null, role = Role.USER }) {
    if (!nickname || nickname.length < 3 || nickname.length > 30) {
      throw new Error('nickname має бути від 3 до 30 символів');
    }
    if (!login || login.length < 5 || login.length > 32) {
      throw new Error('login має бути від 5 до 32 символів');
    }
    if (!email || !email.includes('@')) {
      throw new Error('Некоректний email');
    }
    if (!(birthDate instanceof Date) || birthDate >= new Date()) {
      throw new Error('birthDate має бути в минулому');
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

module.exports = { User, Role, PasswordResetToken };
