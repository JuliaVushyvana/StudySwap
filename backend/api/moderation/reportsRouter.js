// Роути /reports: приймають запит, викликають reportService і віддають відповідь за контрактом.

const express = require('express');
const { setRequestAttributes } = require('../middleware/telemetry');

function createReportsRouter({ reportService }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const report = reportService.create(req.user, req.body, req.get('Idempotency-Key'));
    setRequestAttributes(req, { 'material.id': String(report.materialId) });
    res.status(201).json(report);
  });

  router.get('/', (req, res) => {
    res.status(200).json(reportService.list(req.user, req.query));
  });

  router.post('/:id/decision', (req, res) => {
    res.status(200).json(reportService.decide(req.user, req.params.id, req.body));
  });

  return router;
}

module.exports = { createReportsRouter };
