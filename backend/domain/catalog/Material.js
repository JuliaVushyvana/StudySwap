// Піддомен «Каталог матеріалів» (основний)
// Сутності: Material, MaterialFile, MaterialType + Catalog (пошук і фільтри)

const MaterialType = Object.freeze([
  'конспект', 'лекція', 'практична', 'лабораторна', 'презентація',
  'відео', 'аудіо', 'курсова', 'дипломна', 'магістерська',
]);

const MaterialStatus = Object.freeze({
  PUBLISHED: 'published',
  DELETED: 'deleted',
});

const MB = 1024 * 1024;

// Допустимі формати й ліміти розміру (business_doc.md, нефункціональна вимога №9)
const FORMAT_LIMITS = Object.freeze({
  pdf: 50 * MB, doc: 20 * MB, docx: 20 * MB, txt: 20 * MB,
  ppt: 50 * MB, pptx: 50 * MB,
  zip: 50 * MB,
  mp3: 30 * MB, wav: 30 * MB,
  mp4: 100 * MB,
});

// Файл матеріалу: опис файлу всередині матеріалу (не плутати зі StoredFile у сховищі)
class MaterialFile {
  constructor({ fileName, sizeBytes, url }) {
    const format = fileName.split('.').pop().toLowerCase();
    const limit = FORMAT_LIMITS[format];
    if (!limit) throw new Error(`Формат .${format} не підтримується`); // 400
    if (sizeBytes > limit) throw new Error(`Файл .${format} більший за ${limit / MB} МБ`); // 400
    this.fileName = fileName;
    this.format = format;
    this.sizeBytes = sizeBytes;
    this.url = url;
  }
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const COURSE_MIN = 1;
const COURSE_MAX = 6;

// Інваріанти матеріалу: перевіряються і при створенні, і при оновленні
function assertMaterialFields({ title, description, subject, university, course, type }) {
  if (!title || title.length > TITLE_MAX) throw new Error(`Назва має бути від 1 до ${TITLE_MAX} символів`);
  if (description.length > DESCRIPTION_MAX) throw new Error(`Опис до ${DESCRIPTION_MAX} символів`);
  if (!subject) throw new Error('Потрібен предмет');
  if (!university) throw new Error('Потрібен університет');
  if (!Number.isInteger(course) || course < COURSE_MIN || course > COURSE_MAX) throw new Error(`Курс від ${COURSE_MIN} до ${COURSE_MAX}`);
  if (!MaterialType.includes(type)) throw new Error(`Невідомий тип матеріалу: ${type}`);
}

class Material {
  constructor({
    id, title, description = '', subject, university, course, type, file, authorId, authorNickname,
    status = MaterialStatus.PUBLISHED, createdAt = new Date(), updatedAt = createdAt,
  }) {
    assertMaterialFields({ title, description, subject, university, course, type });
    if (!(file instanceof MaterialFile)) throw new Error('Потрібен файл матеріалу');
    this.id = id;
    this.title = title;
    this.description = description;
    this.subject = subject;
    this.university = university;
    this.course = course;
    this.type = type;
    this.file = file;
    this.authorId = authorId;             // автор матеріалу (User.id)
    this.authorNickname = authorNickname;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  isPublished() {
    return this.status === MaterialStatus.PUBLISHED;
  }

  // Автор змінює й видаляє свій матеріал, адмін — будь-який
  canBeEditedBy(user) {
    return user.isAdmin() || user.id === this.authorId;
  }

  canBeDeletedBy(user) {
    return this.canBeEditedBy(user);
  }

  // Часткове оновлення; файл і автора змінити не можна
  update(changes, user, now = new Date()) {
    if (!this.canBeEditedBy(user)) throw new Error('Недостатньо прав'); // 403
    if (!this.isPublished()) throw new Error('Матеріал видалено'); // 404
    const next = {
      title: this.title, description: this.description, subject: this.subject,
      university: this.university, course: this.course, type: this.type,
      ...changes,
    };
    assertMaterialFields(next);
    Object.assign(this, next);
    this.updatedAt = now;
  }

  delete(user) {
    if (!this.canBeDeletedBy(user)) throw new Error('Недостатньо прав'); // 403
    if (!this.isPublished()) throw new Error('Матеріал уже видалено'); // 404
    this.status = MaterialStatus.DELETED;
  }

  // Чи підходить матеріал під пошуковий запит і фільтри
  matches({ q, subject, university, course, type } = {}) {
    if (!this.isPublished()) return false;
    if (q && !this.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (subject && this.subject !== subject) return false;
    if (university && this.university !== university) return false;
    if (course && this.course !== Number(course)) return false;
    if (type && this.type !== type) return false;
    return true;
  }
}

// Каталог: усі опубліковані й невидалені матеріали
class Catalog {
  constructor() {
    this.materials = [];
  }

  publish(material, author) {
    if (!author.canPublish()) throw new Error('Гість або заблокований користувач не може публікувати'); // 401
    this.materials.push(material);
    return material;
  }

  findById(id) {
    return this.materials.find(m => m.id === id && m.isPublished()) || null;
  }

  // sort: 'new' (за замовчуванням, спочатку нові) або 'title' (А-Я)
  search(filters = {}, sort = 'new') {
    const found = this.materials.filter(m => m.matches(filters));
    return sort === 'title'
      ? found.sort((a, b) => a.title.localeCompare(b.title, 'uk'))
      : found.sort((a, b) => b.createdAt - a.createdAt);
  }

  byAuthor(authorId) {
    return this.materials.filter(m => m.authorId === authorId && m.isPublished());
  }

  // Коли автора заблоковано, його матеріали зникають з каталогу
  removeAllByAuthor(authorId) {
    this.byAuthor(authorId).forEach(m => { m.status = MaterialStatus.DELETED; });
  }
}

module.exports = {
  Material, MaterialFile, MaterialType, MaterialStatus, Catalog, FORMAT_LIMITS,
  TITLE_MAX, DESCRIPTION_MAX, COURSE_MIN, COURSE_MAX,
};
