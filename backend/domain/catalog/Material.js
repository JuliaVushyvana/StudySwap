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

class Material {
  constructor({ id, title, description = '', subject, university, course, type, file, authorId, authorNickname, createdAt = new Date() }) {
    if (!title || title.length > 200) throw new Error('Назва має бути від 1 до 200 символів');
    if (description.length > 1000) throw new Error('Опис до 1000 символів');
    if (!Number.isInteger(course) || course < 1 || course > 6) throw new Error('Курс від 1 до 6');
    if (!MaterialType.includes(type)) throw new Error(`Невідомий тип матеріалу: ${type}`);
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
    this.status = MaterialStatus.PUBLISHED;
    this.createdAt = createdAt;
  }

  isPublished() {
    return this.status === MaterialStatus.PUBLISHED;
  }

  // Автор видаляє свій матеріал, адмін — будь-який
  canBeDeletedBy(user) {
    return user.isAdmin() || user.id === this.authorId;
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

module.exports = { Material, MaterialFile, MaterialType, MaterialStatus, Catalog, FORMAT_LIMITS };
