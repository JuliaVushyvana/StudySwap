// Відкликані токени (вихід з акаунта). JWT без стану, тому після POST /auth/logout
// його jti зберігається тут до закінчення строку дії токена.

function createRevokedTokenRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti        TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    )
  `);

  return {
    // Заодно прибирає записи, строк яких минув: такі токени verify і так відхилить
    revoke(jti, expiresAt, now = new Date()) {
      db.prepare('DELETE FROM revoked_tokens WHERE expires_at <= ?').run(now.toISOString());
      db.prepare('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt.toISOString());
    },

    isRevoked(jti) {
      return Boolean(db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(jti));
    },
  };
}

module.exports = { createRevokedTokenRepository };
