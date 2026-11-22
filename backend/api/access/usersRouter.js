// Роути /users: профіль того, хто увійшов (/users/me), і керування ролями для суперадміна.
// Логіка — у profileService, roleService і materialService.

const express = require('express');

function createUsersRouter({ profileService, roleService, materialService }) {
  const router = express.Router();

  router.get('/me', (req, res) => {
    res.status(200).json(profileService.me(req.user));
  });

  router.patch('/me', (req, res) => {
    res.status(200).json(profileService.updateMe(req.user, req.body));
  });

  router.post('/me/password', async (req, res) => {
    await profileService.changePassword(req.user, req.body);
    res.status(204).end();
  });

  // «Мої матеріали» в профілі
  router.get('/me/materials', (req, res) => {
    res.status(200).json(materialService.listMine(req.user));
  });

  // Суперадмін: список користувачів і призначення ролі. /me оголошено вище, тож не плутається з /:id
  router.get('/', (req, res) => {
    res.status(200).json(roleService.list(req.user, req.query));
  });

  router.patch('/:id/role', (req, res) => {
    res.status(200).json(roleService.setRole(req.user, req.params.id, req.body));
  });

  return router;
}

module.exports = { createUsersRouter };
