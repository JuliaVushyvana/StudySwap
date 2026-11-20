// Таблиця stored_files належить модулю storage. Інші модулі не читають її напряму.

const { StoredFile } = require('../../domain/storage/StoredFile');

function createFileRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stored_files (
      id            TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size_bytes    INTEGER NOT NULL,
      uploaded_by   INTEGER NOT NULL,
      uploaded_at   TEXT NOT NULL
    )
  `);

  return {
    count() {
      return db.prepare('SELECT COUNT(*) AS c FROM stored_files').get().c;
    },

    findById(id) {
      const row = db.prepare('SELECT * FROM stored_files WHERE id = ?').get(id);
      return row && new StoredFile({
        id: row.id, originalName: row.original_name, mimeType: row.mime_type,
        sizeBytes: row.size_bytes, uploadedBy: row.uploaded_by, uploadedAt: new Date(row.uploaded_at),
      });
    },

    insert(file) {
      db.prepare(`
        INSERT INTO stored_files (id, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(file.id, file.originalName, file.mimeType, file.sizeBytes, file.uploadedBy, file.uploadedAt.toISOString());
    },
  };
}

module.exports = { createFileRepository };
