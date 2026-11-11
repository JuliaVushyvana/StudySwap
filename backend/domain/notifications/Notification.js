// Піддомен «Сповіщення» (загальний)

const NotificationKind = Object.freeze({
  NEW_COMMENT: 'new_comment',     // новий коментар під твоїм матеріалом
  REPORT_RESULT: 'report_result', // твою скаргу розглянули
});

class Notification {
  constructor({ id, recipientId, kind, message, link, createdAt = new Date() }) {
    if (!Object.values(NotificationKind).includes(kind)) throw new Error(`Невідомий вид сповіщення: ${kind}`);
    this.id = id;
    this.recipientId = recipientId; // отримувач (User.id)
    this.kind = kind;
    this.message = message;
    this.link = link;
    this.createdAt = createdAt;
    this.readAt = null;
  }

  isRead() {
    return this.readAt !== null;
  }

  markAsRead(now = new Date()) {
    if (!this.isRead()) this.readAt = now;
  }
}

module.exports = { Notification, NotificationKind };
