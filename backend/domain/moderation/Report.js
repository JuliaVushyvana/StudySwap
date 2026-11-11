// Піддомен «Модерація» (допоміжний)
// Сутності: Report, ModerationDecision

const ReportStatus = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

// Рішення адміна за скаргою
class ModerationDecision {
  constructor({ deleteMaterial = false, blockAuthor = false, comment = '' }) {
    this.deleteMaterial = deleteMaterial;
    this.blockAuthor = blockAuthor;
    this.comment = comment;
  }
}

class Report {
  constructor({ id, materialId, materialAuthorId, reporterId, text, createdAt = new Date() }) {
    if (!text || text.length > 1000) throw new Error('Текст скарги від 1 до 1000 символів'); // 400
    this.id = id;
    this.materialId = materialId;
    this.materialAuthorId = materialAuthorId; // порушник
    this.reporterId = reporterId;             // заявник
    this.text = text;
    this.status = ReportStatus.OPEN;
    this.decision = null;
    this.createdAt = createdAt;
  }

  // Задовольнити скаргу. Що саме зробити (видалити матеріал, заблокувати автора),
  // записано в decision; виконують це контексти «Каталог» і «Користувачі та доступ».
  resolve(admin, decision) {
    this.#checkCanReview(admin);
    this.decision = decision;
    this.status = ReportStatus.RESOLVED;
    return decision;
  }

  // Відхилити: порушення немає
  reject(admin, comment = '') {
    this.#checkCanReview(admin);
    this.decision = new ModerationDecision({ comment });
    this.status = ReportStatus.REJECTED;
  }

  #checkCanReview(admin) {
    if (!admin.isAdmin()) throw new Error('Розглядати скарги може лише адмін'); // 403
    if (this.status !== ReportStatus.OPEN) throw new Error('Скаргу вже розглянуто'); // 409
  }
}

module.exports = { Report, ReportStatus, ModerationDecision };
