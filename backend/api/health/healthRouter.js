const express = require('express');

function createHealthRouter() {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.type('text/plain').send('ok');
  });
  return router;
}

module.exports = { createHealthRouter };
