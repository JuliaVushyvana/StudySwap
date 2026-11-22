// Таблиця users належить модулю access. Інші модулі не читають її напряму.

const { User } = require('../../domain/access/User');
const { ConflictError } = require('../errors');

// Колонка з повідомлення SQLite «UNIQUE constraint failed: users.login» → код 409
const CONFLICT_CODES = { nickname: 'NICKNAME_TAKEN', login: 'LOGIN_TAKEN', email: 'EMAIL_TAKEN' };

function createUserRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname      TEXT NOT NULL UNIQUE,
      login         TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      birth_date    TEXT NOT NULL,
      avatar_url    TEXT,
      role          TEXT NOT NULL,
      is_blocked    INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Міграція: унікальність без урахування регістру (Anna і anna — той самий нікнейм).
  // IF NOT EXISTS — індекси додаються й до вже створеної таблиці в старому data.db.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_uq ON users (nickname COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS users_login_uq    ON users (login COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq    ON users (email COLLATE NOCASE);
  `);

  const toDomain = (row) => {
    const user = new User({
      id: row.id, nickname: row.nickname, login: row.login, email: row.email,
      passwordHash: row.password_hash, birthDate: new Date(row.birth_date),
      avatarUrl: row.avatar_url, role: row.role,
    });
    user.isBlocked = row.is_blocked === 1;
    return user;
  };

  const findOne = (sql, value) => {
    const row = db.prepare(sql).get(value);
    return row ? toDomain(row) : null;
  };

  return {
    count() {
      return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    },

    findById(id) {
      return findOne('SELECT * FROM users WHERE id = ?', id);
    },

    findByLogin(login) {
      return findOne('SELECT * FROM users WHERE login = ? COLLATE NOCASE', login);
    },

    findByEmail(email) {
      return findOne('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
    },

    findByNickname(nickname) {
      return findOne('SELECT * FROM users WHERE nickname = ? COLLATE NOCASE', nickname);
    },

    // Кидає ConflictError, якщо nickname, login чи email уже зайняті (зокрема в гонці двох реєстрацій)
    insert(user) {
      try {
        const { lastInsertRowid } = db.prepare(`
          INSERT INTO users (nickname, login, email, password_hash, birth_date, avatar_url, role, is_blocked)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.nickname, user.login, user.email, user.passwordHash,
          user.birthDate.toISOString().slice(0, 10), user.avatarUrl, user.role, user.isBlocked ? 1 : 0);
        return Number(lastInsertRowid);
      } catch (err) {
        const column = err.code === 'SQLITE_CONSTRAINT_UNIQUE' && /users\.(\w+)/.exec(err.message);
        if (column && CONFLICT_CODES[column[1]]) throw new ConflictError(CONFLICT_CODES[column[1]]);
        throw err;
      }
    },
  };
}

module.exports = { createUserRepository };
