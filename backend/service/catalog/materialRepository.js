// Таблиця materials належить модулю catalog. Інші модулі не читають її напряму.

const { Material, MaterialFile, MaterialStatus } = require('../../domain/catalog/Material');

function createMaterialRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      subject         TEXT NOT NULL,
      university      TEXT NOT NULL,
      course          INTEGER NOT NULL,
      type            TEXT NOT NULL,
      file_name       TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_url        TEXT NOT NULL,
      author_id       INTEGER NOT NULL,
      author_nickname TEXT NOT NULL,
      status          TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    )
  `);

  const toDomain = (row) => new Material({
    id: row.id, title: row.title, description: row.description, subject: row.subject,
    university: row.university, course: row.course, type: row.type,
    file: new MaterialFile({ fileName: row.file_name, sizeBytes: row.file_size_bytes, url: row.file_url }),
    authorId: row.author_id, authorNickname: row.author_nickname, status: row.status,
    createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
  });

  return {
    findById(id) {
      const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
      return row ? toDomain(row) : null;
    },

    findPublished() {
      return db.prepare('SELECT * FROM materials WHERE status = ?').all(MaterialStatus.PUBLISHED).map(toDomain);
    },

    insert(m) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO materials (title, description, subject, university, course, type,
          file_name, file_size_bytes, file_url, author_id, author_nickname, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(m.title, m.description, m.subject, m.university, m.course, m.type,
        m.file.fileName, m.file.sizeBytes, m.file.url, m.authorId, m.authorNickname, m.status,
        m.createdAt.toISOString(), m.updatedAt.toISOString());
      return Number(lastInsertRowid);
    },

    update(m) {
      db.prepare(`
        UPDATE materials
        SET title = ?, description = ?, subject = ?, university = ?, course = ?, type = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(m.title, m.description, m.subject, m.university, m.course, m.type, m.status, m.updatedAt.toISOString(), m.id);
    },
  };
}

module.exports = { createMaterialRepository };
