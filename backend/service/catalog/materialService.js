// Use-case-и ресурсу «Матеріал». Публічний інтерфейс модуля catalog.

const { Material, MaterialFile, Catalog } = require('../../domain/catalog/Material');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../errors');
const { validateCreate, validateUpdate, parseListQuery, parseId, toResponse } = require('./materialDto');

const PAGE_SIZE = 20;

// Залежності передаються ззовні, щоб у тестах підставити фейки замість БД і сховища
function createMaterialService({ materialRepository, storageService, now = () => new Date() }) {
  // Опублікований матеріал за id зі шляху або 404
  const findPublished = (rawId) => {
    const id = parseId(rawId);
    const material = id && materialRepository.findById(id);
    if (!material || !material.isPublished()) throw new NotFoundError('MATERIAL_NOT_FOUND');
    return material;
  };

  const requireUser = (user) => {
    if (!user || !user.canPublish()) throw new UnauthorizedError();
  };

  return {
    list(query) {
      const { errors, filters, sort, page } = parseListQuery(query);
      if (errors.length) throw new ValidationError(errors);

      const catalog = new Catalog();
      catalog.materials = materialRepository.findPublished();
      const found = catalog.search(filters, sort);
      const items = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(toResponse);
      return { items, total: found.length, page };
    },

    get(rawId) {
      return toResponse(findPublished(rawId));
    },

    create(user, body) {
      requireUser(user);
      const errors = validateCreate(body);
      if (errors.length) throw new ValidationError(errors);

      const stored = storageService.getFile(body.fileId);
      if (!stored) {
        throw new ValidationError([{ field: 'fileId', code: 'FILE_REQUIRED', message: 'Файл із таким fileId не завантажено' }]);
      }
      let file;
      try {
        file = new MaterialFile({ fileName: stored.fileName, sizeBytes: stored.sizeBytes, url: stored.url });
      } catch (e) {
        throw new ValidationError([{ field: 'fileId', code: 'INVALID_FILE', message: e.message }]);
      }

      const material = new Material({
        title: body.title, description: body.description, subject: body.subject,
        university: body.university, course: body.course, type: body.type,
        file, authorId: user.id, authorNickname: user.nickname, createdAt: now(),
      });
      material.id = materialRepository.insert(material);
      return toResponse(material);
    },

    update(user, rawId, body) {
      requireUser(user);
      const material = findPublished(rawId);
      if (!material.canBeEditedBy(user)) throw new ForbiddenError();
      const errors = validateUpdate(body);
      if (errors.length) throw new ValidationError(errors);

      material.update(body, user, now());
      materialRepository.update(material);
      return toResponse(material);
    },

    remove(user, rawId) {
      requireUser(user);
      const material = findPublished(rawId);
      if (!material.canBeDeletedBy(user)) throw new ForbiddenError();

      material.delete(user);
      material.updatedAt = now();
      materialRepository.update(material);
    },
  };
}

module.exports = { createMaterialService, PAGE_SIZE };
