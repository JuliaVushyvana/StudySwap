// Піддомен «Зберігання файлів» (загальний)
// Сам файл у сховищі та дані про його завантаження.

const crypto = require('crypto');

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

module.exports = { StoredFile };
