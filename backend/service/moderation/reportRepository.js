// Таблиця reports належить модулю moderation. Інші модулі не читають її напряму.

const { Report, ModerationDecision } = require('../../domain/moderation/Report');

function createReportRepository(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id              INTEGER NOT NULL,
      material_title           TEXT NOT NULL,
      material_author_id       INTEGER NOT NULL,
      material_author_nickname TEXT NOT NULL,
      reporter_id              INTEGER NOT NULL,
      reporter_nickname        TEXT NOT NULL,
      text                     TEXT NOT NULL,
      status                   TEXT NOT NULL,
      delete_material          INTEGER,
      decision_comment         TEXT,
      reviewer_id              INTEGER,
      reviewed_at              TEXT,
      created_at               TEXT NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS reports_status ON reports (status)');

  // Знімок матеріалу й автора на момент скарги та рішення адміна — поля поруч із доменним Report
  const toDomain = (row) => {
    const report = new Report({
      id: row.id, materialId: row.material_id, materialAuthorId: row.material_author_id,
      reporterId: row.reporter_id, text: row.text, createdAt: new Date(row.created_at),
    });
    report.status = row.status;
    report.decision = row.reviewed_at
      ? new ModerationDecision({ deleteMaterial: Boolean(row.delete_material), comment: row.decision_comment ?? '' })
      : null;
    return Object.assign(report, {
      materialTitle: row.material_title,
      materialAuthorNickname: row.material_author_nickname,
      reporterNickname: row.reporter_nickname,
      reviewerId: row.reviewer_id,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    });
  };

  const where = (status) => (status ? { sql: 'WHERE status = ?', args: [status] } : { sql: '', args: [] });

  return {
    findById(id) {
      const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
      return row ? toDomain(row) : null;
    },

    // Сторінка скарг, спочатку нові; status — фільтр або undefined
    findPage({ status, limit, offset }) {
      const w = where(status);
      return db.prepare(`SELECT * FROM reports ${w.sql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...w.args, limit, offset).map(toDomain);
    },

    count({ status }) {
      const w = where(status);
      return db.prepare(`SELECT COUNT(*) AS n FROM reports ${w.sql}`).get(...w.args).n;
    },

    insert(r) {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO reports (material_id, material_title, material_author_id, material_author_nickname,
          reporter_id, reporter_nickname, text, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(r.materialId, r.materialTitle, r.materialAuthorId, r.materialAuthorNickname,
        r.reporterId, r.reporterNickname, r.text, r.status, r.createdAt.toISOString());
      return Number(lastInsertRowid);
    },

    // Зберігає рішення адміна
    saveDecision(r) {
      db.prepare(`
        UPDATE reports SET status = ?, delete_material = ?, decision_comment = ?, reviewer_id = ?, reviewed_at = ?
        WHERE id = ?
      `).run(r.status, r.decision.deleteMaterial ? 1 : 0, r.decision.comment, r.reviewerId, r.reviewedAt.toISOString(), r.id);
    },
  };
}

module.exports = { createReportRepository };
