// Публічний інтерфейс модуля storage для інших модулів.

function createStorageService({ fileRepository }) {
  return {
    // Дані про завантажений файл або null, якщо такого fileId немає
    getFile(fileId) {
      const file = fileRepository.findById(fileId);
      if (!file) return null;
      return { id: file.id, fileName: file.originalName, sizeBytes: file.sizeBytes, url: file.url() };
    },
  };
}

module.exports = { createStorageService };
