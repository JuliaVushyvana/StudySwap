// Демонстрація моделей: з папки backend запустити  node domain/demo.js
// Проганяє сценарії з business_doc.md: публікація, пошук, коментар, скарга, блокування.

const {
  User, Role, PasswordResetToken,
  StoredFile, MaterialFile, Material, Catalog,
  CommentThread, Report, ModerationDecision,
  UserProfile, Notification, NotificationKind,
} = require('./index');

const born = new Date('2005-03-14');

// 1. Користувачі та доступ
const anna  = new User({ id: 1, nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash: 'x', birthDate: born });
const ivan  = new User({ id: 2, nickname: 'Ivan', login: 'ivan_p', email: 'ivan@uni.ua', passwordHash: 'x', birthDate: born });
const admin = new User({ id: 3, nickname: 'Admin', login: 'admin1', email: 'admin@uni.ua', passwordHash: 'x', birthDate: born, role: Role.ADMIN });

const token = new PasswordResetToken({ tokenHash: 'h', userId: anna.id });
token.use();
console.log('1) Токен скидання пароля одноразовий:', token.isValid() === false);

// 2. Зберігання файлів -> Каталог: перевірений файл стає MaterialFile
const stored = new StoredFile({ originalName: 'normalization.pdf', mimeType: 'application/pdf', sizeBytes: 2 * 1024 * 1024, uploadedBy: anna.id });
const file = new MaterialFile({ fileName: stored.originalName, sizeBytes: stored.sizeBytes, url: stored.url() });
try {
  new MaterialFile({ fileName: 'lecture.mp4', sizeBytes: 500 * 1024 * 1024, url: '/files/x' });
} catch (e) {
  console.log('2) Файл відхилено:', e.message);
}

// 3. Каталог: публікація і пошук
const catalog = new Catalog();
const material = catalog.publish(new Material({
  id: 100, title: 'Нормалізація БД', subject: 'Бази даних', university: 'КПІ',
  course: 2, type: 'конспект', file, authorId: anna.id, authorNickname: anna.nickname,
}), anna);
console.log('3) Пошук «нормалізація», 2 курс:', catalog.search({ q: 'нормалізація', course: 2 }).map(m => m.title));

// 4. Профілі: збираються з User і Каталогу
console.log('4) Матеріалів у профілі Anna:', UserProfile.build(anna, catalog).materialsCount());

// 5. Обговорення -> Сповіщення
const thread = new CommentThread({ materialId: material.id, materialAuthorId: anna.id });
const comment = thread.addComment(ivan, 'Дуже допомогло перед екзаменом!');
const notifications = [];
if (thread.shouldNotifyAuthor(comment)) {
  notifications.push(new Notification({
    id: 1, recipientId: thread.materialAuthorId, kind: NotificationKind.NEW_COMMENT,
    message: `Новий коментар під «${material.title}»`, link: `/materials/${material.id}`,
  }));
}
console.log('5) Коментарів:', thread.list().length, '| Сповіщення для Anna:', notifications[0].message);

// 6. Модерація: скарга -> рішення адміна -> виконання в інших контекстах
const report = new Report({ id: 1, materialId: material.id, materialAuthorId: anna.id, reporterId: ivan.id, text: 'Чужий конспект без дозволу автора' });
const decision = report.resolve(admin, new ModerationDecision({ deleteMaterial: true, blockAuthor: true, comment: 'Порушення авторських прав' }));

if (decision.deleteMaterial) { material.delete(admin); thread.close(); }
if (decision.blockAuthor)    { anna.block(admin); catalog.removeAllByAuthor(anna.id); }
notifications.push(new Notification({
  id: 2, recipientId: report.reporterId, kind: NotificationKind.REPORT_RESULT,
  message: 'Вашу скаргу розглянуто: матеріал видалено', link: `/reports/${report.id}`,
}));

console.log('6) Статус скарги:', report.status, '| Anna заблокована:', anna.isBlocked);
console.log('   Матеріал у пошуку після видалення:', catalog.search({ q: 'нормалізація' }).length);
try {
  report.reject(admin);
} catch (e) {
  console.log('   Повторний розгляд:', e.message);
}
try {
  thread.addComment(ivan, 'Ще один коментар');
} catch (e) {
  console.log('   Новий коментар:', e.message);
}
