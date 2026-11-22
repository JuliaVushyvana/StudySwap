// Збірка фронтенду: копіює сайт у dist/ і перевіряє, що кожен локальний файл,
// на який посилаються сторінки (<script src>, <link href>, <img src>, <a href>), існує.
// Бандлер не потрібен: сторінки підключають звичайні скрипти. Запуск: npm run build

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Що потрапляє на сайт: сторінки, стилі, скрипти сторінок, бібліотеки, картинки
const ENTRIES = (name) => /\.(html|css|js)$/.test(name) && name !== 'eslint.config.js';
const DIRS = ['lib', 'vendor', 'img'];

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
if (htmlFiles.length === 0) throw new Error('Немає жодної HTML-сторінки');

// 1. Перевірка посилань
const problems = [];
for (const page of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    // зовнішні адреси, якорі, mailto і т. п. не перевіряємо
    if (/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(ref)) continue;
    const file = ref.split(/[?#]/)[0];
    if (!file) continue;
    if (!fs.existsSync(path.join(ROOT, file))) problems.push(`${page}: немає файлу «${file}»`);
  }
}
if (problems.length) {
  console.error('Збірку зупинено, бо є биті посилання:');
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exit(1);
}

// 2. Копіювання в dist/
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const files = fs.readdirSync(ROOT).filter(ENTRIES);
files.forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f)));
DIRS.filter((d) => fs.existsSync(path.join(ROOT, d)))
  .forEach((d) => fs.cpSync(path.join(ROOT, d), path.join(DIST, d), { recursive: true }));

console.log(`✓ Перевірено ${htmlFiles.length} сторінок, биті посилання не знайдено`);
console.log(`✓ Зібрано в dist/: ${files.length} файлів + ${DIRS.join(', ')}`);
