const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )
`);

const { c } = db.prepare('SELECT COUNT(*) AS c FROM items').get();
if (c === 0) {
  const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
  ['Конспект з математики Лекція 1',
   'Архітектура Лаб 1',
   'Приклади екзаменаційних питань з БД',
   'Пояснення теми "Принципи ООП" з ООП'].forEach(n => insert.run(n));
}

module.exports = db;