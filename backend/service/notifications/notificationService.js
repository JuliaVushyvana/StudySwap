// Use-case-и «Сповіщення». Публічний інтерфейс модуля notifications:
// notify() викликають інші модулі (discussion — новий коментар, moderation — результат скарги),
// list / markRead / markAllRead — роути /notifications.

const { Notification, NotificationKind } = require('../../domain/notifications/Notification');
const { UnauthorizedError, NotFoundError } = require('../errors');

const LIST_LIMIT = 50;

// Ідентифікатор зі шляху: додатне ціле або null
const parseId = (raw) => (/^[1-9]\d*$/.test(String(raw)) ? Number(raw) : null);

// Notification (domain) → NotificationResponse
const toResponse = (n) => ({
  id: n.id,
  kind: n.kind,
  message: n.message,
  link: n.link ?? null,
  createdAt: n.createdAt.toISOString(),
  read: n.isRead(),
});

function createNotificationService({ notificationRepository, accessPolicy, now = () => new Date() }) {
  const { Permission, can } = accessPolicy;
  const requireReader = (user) => {
    if (!can(user, Permission.NOTIFICATION_READ)) throw new UnauthorizedError();
  };

  return {
    Kind: NotificationKind,

    // Створює сповіщення для recipientId. kind — NotificationKind; link — шлях ресурсу API або null
    notify({ recipientId, kind, message, link = null }) {
      const notification = new Notification({ recipientId, kind, message, link, createdAt: now() });
      notification.id = notificationRepository.insert(notification);
      return notification.id;
    },

    list(user) {
      requireReader(user);
      return {
        items: notificationRepository.findByRecipient(user.id, LIST_LIMIT).map(toResponse),
        unread: notificationRepository.countUnread(user.id),
      };
    },

    // Чуже сповіщення — теж 404: не підтверджуємо, що таке id існує
    markRead(user, rawId) {
      requireReader(user);
      const id = parseId(rawId);
      const notification = id && notificationRepository.findById(id);
      if (!notification || notification.recipientId !== user.id) throw new NotFoundError('NOTIFICATION_NOT_FOUND');
      notificationRepository.markRead(id, now());
    },

    markAllRead(user) {
      requireReader(user);
      notificationRepository.markAllRead(user.id, now());
    },
  };
}

module.exports = { createNotificationService, LIST_LIMIT };
