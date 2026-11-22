// Роути /notifications: приймають запит, викликають notificationService і віддають відповідь за контрактом.

const express = require('express');

function createNotificationsRouter({ notificationService }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json(notificationService.list(req.user));
  });

  router.post('/read-all', (req, res) => {
    notificationService.markAllRead(req.user);
    res.status(204).end();
  });

  router.post('/:id/read', (req, res) => {
    notificationService.markRead(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { createNotificationsRouter };
