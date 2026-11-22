// Вміст файлів на диску: <dir>/<fileId>. Дані про файли (назва, розмір, хто завантажив) — у таблиці stored_files.
// Окремий модуль, щоб у тестах підставити сховище в пам'яті замість диска.

const fs = require('fs');
const path = require('path');

function createFileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // fileId — UUID, але перевіряємо, щоб ніхто не вийшов за межі папки через ../
  const pathOf = (id) => {
    if (!/^[\w-]+$/.test(id)) throw new Error('Некоректний fileId');
    return path.join(dir, id);
  };

  return {
    write(id, buffer) {
      fs.writeFileSync(pathOf(id), buffer);
    },
    // Повний шлях до файлу або null, якщо вмісту немає (наприклад, тестові записи з seed.js)
    pathIfExists(id) {
      const p = pathOf(id);
      return fs.existsSync(p) ? p : null;
    },
  };
}

module.exports = { createFileStore };
