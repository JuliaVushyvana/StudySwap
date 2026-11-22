// Роути /materials/:id/comments: приймають запит, викликають commentService і віддають відповідь за контрактом.

const express = require('express');
const { setRequestAttributes } = require('../middleware/telemetry');

function createCommentsRouter({ commentService }) {
  // mergeParams: :id матеріалу задається в app.js, у шляху підключення роутера
  const router = express.Router({ mergeParams: true });

  router.use((req, res, next) => {
    setRequestAttributes(req, { 'material.id': req.params.id });
    next();
  });

  router.get('/', (req, res) => {
    res.status(200).json(commentService.list(req.user, req.params.id));
  });

  router.post('/', (req, res) => {
    res.status(201).json(commentService.create(req.user, req.params.id, req.body, req.get('Idempotency-Key')));
  });

  router.delete('/:commentId', (req, res) => {
    commentService.remove(req.user, req.params.id, req.params.commentId);
    res.status(204).end();
  });

  return router;
}

module.exports = { createCommentsRouter };
