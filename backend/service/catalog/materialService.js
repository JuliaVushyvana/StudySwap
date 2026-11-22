// Use-case-и ресурсу «Матеріал». Публічний інтерфейс модуля catalog.

const { Material, MaterialFile, Catalog } = require('../../domain/catalog/Material');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ServiceUnavailableError } = require('../errors');
const { validateCreate, validateUpdate, parseListQuery, parseId, toResponse } = require('./materialDto');

const PAGE_SIZE = 20;
const CATALOG_RETRY_AFTER = 5;

// Залежності передаються ззовні, щоб у тестах підставити фейки замість БД і сховища
function createMaterialService({ materialRepository, storageService, idempotencyService, accessPolicy, userDirectory = null, now = () => new Date(), logger = console }) {
  // Автор показується з актуальним нікнеймом (якщо його змінили в профілі). Ім'я питаємо в модуля access
  // через його публічний сервіс (userDirectory = accessService); збережена копія — запасний варіант.
  const respond = (m) => {
    const dto = toResponse(m);
    const current = userDirectory ? userDirectory.nicknameOf(m.authorId) : null;
    return current ? { ...dto, authorNickname: current } : dto;
  };

  // Остання успішно прочитана копія каталогу: з неї працює пошук у degraded mode, коли БД недоступна
  let catalogSnapshot = null;

  const loadPublished = () => {
    try {
      catalogSnapshot = materialRepository.findPublished();
      return { materials: catalogSnapshot, degraded: false };
    } catch (err) {
      if (!catalogSnapshot) throw new ServiceUnavailableError('CATALOG_UNAVAILABLE', CATALOG_RETRY_AFTER);
      logger.warn('[catalog] БД недоступна, пошук працює з останньої копії каталогу:', err.message);
      return { materials: catalogSnapshot, degraded: true };
    }
  };

  // Опублікований матеріал за id зі шляху або 404
  const findPublished = (rawId) => {
    const id = parseId(rawId);
    const material = id && materialRepository.findById(id);
    if (!material || !material.isPublished()) throw new NotFoundError('MATERIAL_NOT_FOUND');
    return material;
  };

  // Три рівні доступу (публічний інтерфейс модуля access): гість → 401 (потрібен вхід), бракує прав → 403
  const { Permission, can, canManageMaterial } = accessPolicy;
  const requirePermission = (user, permission) => {
    if (!can(user, permission)) throw new UnauthorizedError();
  };
  const requireUser = (user) => {
    if (!user || !user.canPublish()) throw new UnauthorizedError();
  };

  // fileId (файл уже завантажено через POST /files) → MaterialFile з перевіркою формату й розміру
  const materialFileFrom = (fileId) => {
    const stored = storageService.getFile(fileId);
    if (!stored) {
      throw new ValidationError([{ field: 'fileId', code: 'FILE_REQUIRED', message: 'Файл із таким fileId не завантажено' }]);
    }
    try {
      return new MaterialFile({ fileName: stored.fileName, sizeBytes: stored.sizeBytes, url: stored.url });
    } catch (e) {
      throw new ValidationError([{ field: 'fileId', code: 'INVALID_FILE', message: e.message }]);
    }
  };

  const createMaterial = (user, body) => {
    const errors = validateCreate(body);
    if (errors.length) throw new ValidationError(errors);

    const file = materialFileFrom(body.fileId);

    const material = new Material({
      title: body.title, description: body.description, subject: body.subject,
      university: body.university, course: body.course, type: body.type,
      file, authorId: user.id, authorNickname: user.nickname, createdAt: now(),
    });
    material.id = materialRepository.insert(material);
    return respond(material);
  };

  return {
    list(query) {
      const { errors, filters, sort, page } = parseListQuery(query);
      if (errors.length) throw new ValidationError(errors);

      const { materials, degraded } = loadPublished();
      const catalog = new Catalog();
      catalog.materials = materials;
      const found = catalog.search(filters, sort);
      const items = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(respond);
      return { items, total: found.length, page, degraded };
    },

    // «Мої матеріали» в профілі: лише власні опубліковані, спочатку нові
    listMine(user) {
      requirePermission(user, Permission.MATERIAL_CREATE);
      const items = materialRepository.findPublished()
        .filter((m) => m.authorId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(respond);
      return { items, total: items.length };
    },

    // Сторінку матеріалу бачать усі, зокрема гість; сам файл — лише зареєстровані (storageService)
    get(user, rawId) {
      requirePermission(user, Permission.MATERIAL_READ);
      return respond(findPublished(rawId));
    },

    // Повтор із тим самим idempotencyKey повертає вже створений матеріал, а не новий
    create(user, body, idempotencyKey) {
      requirePermission(user, Permission.MATERIAL_CREATE);
      return idempotencyService.run({ userId: user.id, key: idempotencyKey, payload: body }, () => createMaterial(user, body));
    },

    update(user, rawId, body) {
      requireUser(user);
      const material = findPublished(rawId);
      if (!canManageMaterial(user, material, 'update')) throw new ForbiddenError();
      const errors = validateUpdate(body);
      if (errors.length) throw new ValidationError(errors);

      // Нове значення fileId — заміна файлу; решта полів — звичайне оновлення
      const { fileId, ...fields } = body;
      const file = fileId !== undefined ? materialFileFrom(fileId) : null;
      if (Object.keys(fields).length) material.update(fields, user, now());
      if (file) material.replaceFile(file, user, now());
      materialRepository.update(material);
      return respond(material);
    },

    remove(user, rawId) {
      requireUser(user);
      const material = findPublished(rawId);
      if (!canManageMaterial(user, material, 'delete')) throw new ForbiddenError();

      material.delete(user);
      material.updatedAt = now();
      materialRepository.update(material);
    },
  };
}

module.exports = { createMaterialService, PAGE_SIZE };
