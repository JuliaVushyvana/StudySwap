// Use-case-и ресурсу «Коментар». Публічний інтерфейс модуля discussion.

const { CommentThread } = require('../../domain/discussion/CommentThread');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } = require('../errors');
const { validateCreate, parseId, toResponse } = require('./commentDto');

// Матеріал (чи він є, хто автор) питаємо в модуля catalog через його публічний сервіс (materialService):
// його get() уже відповідає 404 MATERIAL_NOT_FOUND для неіснуючого чи видаленого матеріалу.
function createCommentService({ commentRepository, materialService, idempotencyService, accessPolicy, userDirectory = null, now = () => new Date() }) {
  const { Permission, can } = accessPolicy;

  // Автор показується з актуальним нікнеймом, як і в матеріалах; збережена копія — запасний варіант
  const respond = (c, materialId) => {
    const dto = toResponse(c, materialId);
    const current = userDirectory ? userDirectory.nicknameOf(c.authorId) : null;
    return current ? { ...dto, authorNickname: current } : dto;
  };

  const createComment = (user, rawMaterialId, body) => {
    const errors = validateCreate(body);
    if (errors.length) throw new ValidationError(errors);
    const material = materialService.get(user, rawMaterialId);

    const thread = new CommentThread({ materialId: material.id, materialAuthorId: material.authorId });
    const comment = thread.addComment(user, body.text.trim());
    comment.createdAt = now();
    comment.id = commentRepository.insert(material.id, comment);
    return respond(comment, material.id);
  };

  return {
    // Коментарі бачать усі, зокрема гість
    list(user, rawMaterialId) {
      const material = materialService.get(user, rawMaterialId);
      const items = commentRepository.findByMaterial(material.id).map((c) => respond(c, material.id));
      return { items, total: items.length };
    },

    // Повтор із тим самим idempotencyKey повертає вже створений коментар, а не новий
    create(user, rawMaterialId, body, idempotencyKey) {
      if (!can(user, Permission.COMMENT_CREATE)) throw new UnauthorizedError();
      const payload = { materialId: String(rawMaterialId), body };
      return idempotencyService.run({ userId: user.id, key: idempotencyKey, payload }, () => createComment(user, rawMaterialId, body));
    },

    // Видаляють лише адмін і суперадмін (модерація); гість → 401, інший користувач → 403
    remove(user, rawMaterialId, rawCommentId) {
      if (!user || !user.canPublish()) throw new UnauthorizedError();
      if (!can(user, Permission.COMMENT_DELETE_ANY)) throw new ForbiddenError();
      const material = materialService.get(user, rawMaterialId);
      const id = parseId(rawCommentId);
      const comment = id && commentRepository.findById(id);
      // Коментар з іншого матеріалу теж 404: шлях /materials/1/comments/7 не має видаляти коментар матеріалу 2
      if (!comment || comment.materialId !== material.id) throw new NotFoundError('COMMENT_NOT_FOUND');
      commentRepository.delete(id);
    },
  };
}

module.exports = { createCommentService };
