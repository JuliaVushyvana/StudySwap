// Роути /files: завантаження й отримання файлів матеріалів. Уся логіка — в storageService.
//
// POST /files — тіло запиту = сам файл (як є, без multipart), назва — в заголовку X-File-Name
//   (закодована encodeURIComponent, щоб працювали українські літери), тип — у Content-Type.
// GET /files/:id — скачування з оригінальною назвою; потрібен вхід (Authorization: Bearer).
// GET /files/:id/preview — перегляд PDF / DOCX / TXT на сайті (inline), доступний і гостю.

const express = require('express');

const MAX_UPLOAD = '100mb'; // найбільший ліміт серед форматів (mp4); точний ліміт формату перевіряє сервіс

function createFilesRouter({ storageService }) {
  const router = express.Router();

  router.post('/', express.raw({ type: () => true, limit: MAX_UPLOAD }), (req, res) => {
    let fileName = req.get('X-File-Name') || '';
    try { fileName = decodeURIComponent(fileName); } catch { /* лишаємо як є */ }
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(storageService.upload(req.user, { fileName, mimeType: req.get('Content-Type'), buffer }));
  });

  router.get('/:id/preview', (req, res) => {
    const file = storageService.preview(req.user, req.params.id);
    res.set('Cache-Control', 'no-store');
    res.type(file.mimeType);
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.sendFile(file.path);
  });

  router.get('/:id', (req, res) => {
    const file = storageService.download(req.user, req.params.id);
    res.type(file.mimeType);
    res.download(file.path, file.fileName);
  });

  return router;
}

module.exports = { createFilesRouter };
