// Піддомен «Зберігання файлів» (загальний)
// Сам файл у сховищі та дані про його завантаження.

const crypto = require('crypto');

const MB = 1024 * 1024;

// Допустимі формати й ліміти розміру (business_doc.md, нефункціональна вимога №9).
// Перевіряє модуль «Зберігання файлів» під час завантаження (POST /files).
const FILE_LIMITS = Object.freeze({
  pdf: 50 * MB, doc: 20 * MB, docx: 20 * MB, txt: 20 * MB,
  ppt: 50 * MB, pptx: 50 * MB,
  zip: 50 * MB,
  mp3: 30 * MB, wav: 30 * MB,
  mp4: 100 * MB,
});

class StoredFile {
  constructor({ id = crypto.randomUUID(), originalName, mimeType, sizeBytes, uploadedBy, uploadedAt = new Date() }) {
    if (!originalName) throw new Error('Потрібна назва файлу');
    if (!mimeType || !mimeType.includes('/')) throw new Error('Некоректний MIME-тип');
    this.id = id; // ключ у сховищі
    this.originalName = originalName;
    this.mimeType = mimeType;
    this.sizeBytes = sizeBytes;
    this.uploadedBy = uploadedBy; // User.id
    this.uploadedAt = uploadedAt;
  }

  // Посилання, яке Каталог запише в MaterialFile.url
  url() {
    return `/files/${this.id}`;
  }
}

module.exports = { StoredFile, FILE_LIMITS };
