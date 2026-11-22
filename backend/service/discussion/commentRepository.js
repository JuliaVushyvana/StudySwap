// Таблиця comments належить модулю discussion. Інші модулі не читають її напряму.

const { Comment } = require('../../domain/discussion/CommentThread');

function createCommentRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id     INTEGER NOT NULL,
      author_id       INTEGER NOT NULL,
      author_nickname TEXT NOT NULL,
      text            TEXT NOT NULL,
      created_at      TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS comments_material_id ON comments (material_id)');

  const toDomain = (row) => Object.assign(new Comment({
    id: row.id, authorId: row.author_id, authorNickname: row.author_nickname,
    text: row.text, createdAt: new Date(row.created_at),
  }), { materialId: row.material_id });

  return {
    // Коментарі під матеріалом, спочатку старіші
    findByMaterial(materialId) {
      return db.prepare('SELECT * FROM comments WHERE material_id = ? ORDER BY id').all(materialId).map(toDomain);
    },

    findById(id) {
      const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
      return row ? toDomain(row) : null;
    },

    delete(id) {
      db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    },

    insert(materialId, c) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO comments (material_id, author_id, author_nickname, text, created_at) VALUES (?, ?, ?, ?, ?)
      `).run(materialId, c.authorId, c.authorNickname, c.text, c.createdAt.toISOString());
      return Number(lastInsertRowid);
    },
  };
}

module.exports = { createCommentRepository };
