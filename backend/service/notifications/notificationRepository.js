// Таблиця notifications належить модулю notifications. Інші модулі не читають її напряму.

const { Notification } = require('../../domain/notifications/Notification');

function createNotificationRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      kind         TEXT NOT NULL,
      message      TEXT NOT NULL,
      link         TEXT,
      created_at   TEXT NOT NULL,
      read_at      TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS notifications_recipient_id ON notifications (recipient_id)');

  const toDomain = (row) => Object.assign(new Notification({
    id: row.id, recipientId: row.recipient_id, kind: row.kind, message: row.message,
    link: row.link, createdAt: new Date(row.created_at),
  }), { readAt: row.read_at ? new Date(row.read_at) : null });

  return {
    // Останні сповіщення користувача, спочатку нові
    findByRecipient(recipientId, limit) {
      return db.prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY id DESC LIMIT ?')
        .all(recipientId, limit).map(toDomain);
    },

    countUnread(recipientId) {
      return db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = ? AND read_at IS NULL').get(recipientId).n;
    },

    findById(id) {
      const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
      return row ? toDomain(row) : null;
    },

    insert(n) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO notifications (recipient_id, kind, message, link, created_at) VALUES (?, ?, ?, ?, ?)
      `).run(n.recipientId, n.kind, n.message, n.link ?? null, n.createdAt.toISOString());
      return Number(lastInsertRowid);
    },

    markRead(id, readAt) {
      db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(readAt.toISOString(), id);
    },

    markAllRead(recipientId, readAt) {
      db.prepare('UPDATE notifications SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL').run(readAt.toISOString(), recipientId);
    },
  };
}

module.exports = { createNotificationRepository };
