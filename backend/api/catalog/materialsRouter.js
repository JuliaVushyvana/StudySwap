// Роути ресурсу «Матеріал»: приймають запит, викликають materialService і віддають відповідь за контрактом.

const express = require('express');

function createMaterialsRouter({ materialService }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json(materialService.list(req.query));
  });

  router.post('/', (req, res) => {
    res.status(201).json(materialService.create(req.user, req.body));
  });

  router.get('/:id', (req, res) => {
    res.status(200).json(materialService.get(req.params.id));
  });

  router.patch('/:id', (req, res) => {
    res.status(200).json(materialService.update(req.user, req.params.id, req.body));
  });

  router.delete('/:id', (req, res) => {
    materialService.remove(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { createMaterialsRouter };
