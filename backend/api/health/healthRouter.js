// GET /health: 200, якщо всі залежності працюють, інакше 503 зі станом кожної (degraded).

const express = require('express');

function createHealthRouter({ healthService }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    const health = healthService.check();
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  });
  return router;
}

module.exports = { createHealthRouter };
