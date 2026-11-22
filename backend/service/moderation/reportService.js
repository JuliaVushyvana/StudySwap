// Use-case-и «Скарги». Публічний інтерфейс модуля moderation.

const { Report, ReportStatus, ModerationDecision } = require('../../domain/moderation/Report');
const { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } = require('../errors');
const { validateCreate, validateDecision, parseListQuery, parseId, toResponse } = require('./reportDto');

const PAGE_SIZE = 20;

// Інші модулі — лише через їхні публічні сервіси: materialService (catalog) — чи є матеріал і видалення,
// notifier (notificationService) — сповіщення автору скарги, userDirectory (accessService) — актуальні нікнейми
function createReportService({
  reportRepository, materialService, idempotencyService, accessPolicy,
  notifier = null, userDirectory = null, now = () => new Date(), logger = console,
}) {
  const { Permission, can } = accessPolicy;

  const requireReviewer = (user) => {
    if (!user || !user.canPublish()) throw new UnauthorizedError();
    if (!can(user, Permission.REPORT_REVIEW)) throw new ForbiddenError();
  };

  const respond = (r) => {
    const dto = toResponse(r);
    const nick = (id, fallback) => (userDirectory && userDirectory.nicknameOf(id)) || fallback;
    return { ...dto, reporterNickname: nick(r.reporterId, dto.reporterNickname), materialAuthorNickname: nick(r.materialAuthorId, dto.materialAuthorNickname) };
  };

  const createReport = (user, body) => {
    const errors = validateCreate(body);
    if (errors.length) throw new ValidationError(errors);
    const material = materialService.get(user, body.materialId); // 404 MATERIAL_NOT_FOUND, якщо матеріалу немає

    const report = new Report({
      materialId: material.id, materialAuthorId: material.authorId, reporterId: user.id,
      text: body.text.trim(), createdAt: now(),
    });
    Object.assign(report, { materialTitle: material.title, materialAuthorNickname: material.authorNickname, reporterNickname: user.nickname });
    report.id = reportRepository.insert(report);
    return respond(report);
  };

  // Матеріал міг уже видалити автор чи інший адмін — тоді видаляти нічого, скаргу однаково розглядаємо
  const deleteMaterial = (admin, materialId) => {
    try {
      materialService.remove(admin, materialId);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  };

  // Рішення вже збережено: збій сповіщення лише логуємо, щоб адмін не отримав 500 за розглянуту скаргу
  const notifyReporter = (report) => {
    if (!notifier) return;
    const title = `«${report.materialTitle}»`;
    const { deleteMaterial: deleted, comment } = report.decision;
    let message;
    if (report.status === ReportStatus.REJECTED) message = `Вашу скаргу на ${title} відхилено: порушень не знайдено.`;
    else message = `Вашу скаргу на ${title} задоволено${deleted ? ': матеріал видалено' : ''}.`;
    if (comment) message += ` Коментар адміна: ${comment}`;
    try {
      notifier.notify({
        recipientId: report.reporterId, kind: notifier.Kind.REPORT_RESULT, message,
        link: deleted ? null : `/materials/${report.materialId}`,
      });
    } catch (err) {
      logger.warn('[moderation] не вдалося надіслати сповіщення про розгляд скарги:', err.message);
    }
  };

  return {
    // Повтор із тим самим idempotencyKey повертає вже подану скаргу, а не нову
    create(user, body, idempotencyKey) {
      if (!can(user, Permission.REPORT_CREATE)) throw new UnauthorizedError();
      return idempotencyService.run({ userId: user.id, key: idempotencyKey, payload: { report: body } }, () => createReport(user, body));
    },

    list(user, query) {
      requireReviewer(user);
      const { errors, status, page } = parseListQuery(query);
      if (errors.length) throw new ValidationError(errors);
      const items = reportRepository.findPage({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).map(respond);
      return { items, total: reportRepository.count({ status }), page };
    },

    decide(user, rawId, body) {
      requireReviewer(user);
      const errors = validateDecision(body);
      if (errors.length) throw new ValidationError(errors);
      const id = parseId(rawId);
      const report = id && reportRepository.findById(id);
      if (!report) throw new NotFoundError('REPORT_NOT_FOUND');
      if (report.status !== ReportStatus.OPEN) throw new ConflictError('REPORT_ALREADY_REVIEWED');

      const comment = (body.comment ?? '').trim();
      if (body.result === ReportStatus.RESOLVED) {
        const decision = new ModerationDecision({ deleteMaterial: body.deleteMaterial === true, comment });
        if (decision.deleteMaterial) deleteMaterial(user, report.materialId);
        report.resolve(user, decision);
      } else {
        report.reject(user, comment);
      }
      Object.assign(report, { reviewerId: user.id, reviewedAt: now() });
      reportRepository.saveDecision(report);
      notifyReporter(report);
      return respond(report);
    },
  };
}

module.exports = { createReportService, PAGE_SIZE };
