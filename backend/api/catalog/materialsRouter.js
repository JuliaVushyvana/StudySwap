// Роути ресурсу «Матеріал»: приймають запит, викликають materialService і віддають відповідь за контрактом.

const express = require('express');
const { setRequestAttributes } = require('../middleware/telemetry');

function createMaterialsRouter({ materialService }) {
  const router = express.Router();

  router.param('id', (req, res, next, id) => {
    setRequestAttributes(req, { 'material.id': id });
    next();
  });

  router.get('/', (req, res) => {
    res.status(200).json(materialService.list(req.query));
  });

  router.post('/', (req, res) => {
    const material = materialService.create(req.user, req.body, req.get('Idempotency-Key'));
    setRequestAttributes(req, { 'material.id': String(material.id) }); // рядок, як і з :id у URL
    res.status(201).json(material);
  });

  router.get('/:id', (req, res) => {
    res.status(200).json(materialService.get(req.user, req.params.id));
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
