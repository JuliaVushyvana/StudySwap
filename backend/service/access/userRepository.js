// Таблиця users належить модулю access. Інші модулі не читають її напряму.

const { User } = require('../../domain/access/User');

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

  const toDomain = (row) => {
    const user = new User({
      id: row.id, nickname: row.nickname, login: row.login, email: row.email,
      passwordHash: row.password_hash, birthDate: new Date(row.birth_date),
      avatarUrl: row.avatar_url, role: row.role,
    });
    user.isBlocked = row.is_blocked === 1;
    return user;
  };

  return {
    count() {
      return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    },

    findById(id) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return row ? toDomain(row) : null;
    },

    insert(user) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO users (nickname, login, email, password_hash, birth_date, avatar_url, role, is_blocked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.nickname, user.login, user.email, user.passwordHash,
        user.birthDate.toISOString().slice(0, 10), user.avatarUrl, user.role, user.isBlocked ? 1 : 0);
      return Number(lastInsertRowid);
    },
  };
}

module.exports = { createUserRepository };
