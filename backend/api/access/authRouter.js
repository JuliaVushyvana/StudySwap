// Роути /auth/*: реєстрація, вхід і вихід. Уся логіка — в identityService.

const express = require('express');

function createAuthRouter({ identityService }) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    res.status(201).json(await identityService.register(req.body));
  });

  router.post('/login', async (req, res) => {
    res.status(200).json(await identityService.login(req.body));
  });

  router.post('/logout', (req, res) => {
    identityService.logout(req.user, req.token);
    res.status(204).end();
  });

  return router;
}

module.exports = { createAuthRouter };
