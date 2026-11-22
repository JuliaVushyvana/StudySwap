// Публічний інтерфейс модуля storage для інших модулів і api/.
// Завантажувати файли можуть лише зареєстровані, отримувати — теж (права — через accessPolicy модуля access).

const { StoredFile, FILE_LIMITS } = require('../../domain/storage/StoredFile');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../errors');

const MB = 1024 * 1024;
const NAME_MAX = 255;

// Перевірка формату й розміру до запису на диск (business_doc.md, вимога №9)
function validateUpload({ fileName, sizeBytes }) {
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > NAME_MAX) {
    return [{ field: 'file', code: 'FILE_NAME_REQUIRED', message: 'Потрібна назва файлу (заголовок X-File-Name)' }];
  }
  if (!sizeBytes) return [{ field: 'file', code: 'FILE_EMPTY', message: 'Файл порожній' }];
  const format = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const limit = FILE_LIMITS[format];
  if (!limit) {
    return [{ field: 'file', code: 'UNSUPPORTED_FORMAT', message: `Формат${format ? ` .${format}` : ''} не підтримується. Можна: ${Object.keys(FILE_LIMITS).join(', ')}` }];
  }
  if (sizeBytes > limit) {
    return [{ field: 'file', code: 'FILE_TOO_LARGE', message: `Файл .${format} має бути не більший за ${limit / MB} МБ` }];
  }
  return [];
}

function createStorageService({ fileRepository, fileStore, accessPolicy, now = () => new Date() }) {
  const { Permission, can } = accessPolicy;
  const toResponse = (file) => ({ id: file.id, fileName: file.originalName, sizeBytes: file.sizeBytes, url: file.url() });

  return {
    // Дані про завантажений файл або null, якщо такого fileId немає
    getFile(fileId) {
      const file = fileRepository.findById(fileId);
      return file ? toResponse(file) : null;
    },

    // POST /files: зберігає вміст і повертає { id, fileName, sizeBytes, url } для POST /materials (fileId)
    upload(user, { fileName, mimeType, buffer }) {
      if (!can(user, Permission.MATERIAL_CREATE)) throw new UnauthorizedError();
      const sizeBytes = buffer ? buffer.length : 0;
      const errors = validateUpload({ fileName, sizeBytes });
      if (errors.length) throw new ValidationError(errors);

      const file = new StoredFile({
        originalName: fileName.trim(),
        mimeType: mimeType && mimeType.includes('/') ? mimeType : 'application/octet-stream',
        sizeBytes, uploadedBy: user.id, uploadedAt: now(),
      });
      fileStore.write(file.id, buffer);
      fileRepository.insert(file);
      return toResponse(file);
    },

    // GET /files/:id: лише для зареєстрованих, як і сама сторінка матеріалу
    download(user, fileId) {
      if (!can(user, Permission.MATERIAL_READ)) throw new UnauthorizedError();
      const file = /^[\w-]+$/.test(String(fileId)) ? fileRepository.findById(fileId) : null;
      if (!file) throw new NotFoundError('FILE_NOT_FOUND');
      const path = fileStore.pathIfExists(file.id);
      if (!path) throw new NotFoundError('FILE_CONTENT_MISSING'); // запис є, а вмісту немає (тестові дані)
      return { path, fileName: file.originalName, mimeType: file.mimeType };
    },
  };
}

module.exports = { createStorageService, validateUpload };
