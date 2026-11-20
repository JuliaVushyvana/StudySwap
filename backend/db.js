// Підключення до SQLite. Таблиці створює репозиторій модуля, який ними володіє.

const Database = require('better-sqlite3');
const path = require('path');

function openDatabase(file = path.join(__dirname, 'data.db')) {
  return new Database(file);
}

module.exports = { openDatabase };
