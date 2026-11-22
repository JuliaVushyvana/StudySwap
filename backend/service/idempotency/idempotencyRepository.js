// Таблиця idempotency_keys: збережені результати операцій за Idempotency-Key. Належить модулю idempotency.

function createIdempotencyRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      user_id      INTEGER NOT NULL,
      key          TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response     TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);

  return {
    find(userId, key) {
      const row = db.prepare('SELECT * FROM idempotency_keys WHERE user_id = ? AND key = ?').get(userId, key);
      if (!row) return null;
      return { requestHash: row.request_hash, response: JSON.parse(row.response), createdAt: new Date(row.created_at) };
    },

    // Новий запис або заміна простроченого з тим самим ключем
    save({ userId, key, requestHash, response, createdAt }) {
      db.prepare(`
        INSERT OR REPLACE INTO idempotency_keys (user_id, key, request_hash, response, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, key, requestHash, JSON.stringify(response), createdAt.toISOString());
    },
  };
}

module.exports = { createIdempotencyRepository };
