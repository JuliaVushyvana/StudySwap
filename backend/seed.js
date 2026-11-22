// Тестові дані для локального запуску: користувачі, завантажені файли й кілька матеріалів.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { User, Role } = require('./domain/access/User');
const { StoredFile } = require('./domain/storage/StoredFile');
const { Material, MaterialFile } = require('./domain/catalog/Material');

// Справжні навчальні файли для тестових матеріалів: backend/seed-files/
const SEED_FILES_DIR = path.join(__dirname, 'seed-files');
const SEED_FILES = [
  { id: 'f-8c1e2b', name: 'normalization.pdf', mimeType: 'application/pdf', author: 'anna' },
  { id: 'f-oop01', name: 'oop-principles.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', author: 'julia' },
  { id: 'f-exam01', name: 'db-exam-questions.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', author: 'anna' },
];
const seedFilePath = (f) => path.join(SEED_FILES_DIR, f.name);
// Спільний пароль тестових акаунтів anna_k, julia_v, admin1, superadmin (див. README)
const SEED_PASSWORD = 'studyswap123';

function seed(repos) {
  if (repos.userRepository.count() === 0) seedDemo(repos);
  ensureSuperAdmin(repos);
  ensureSeedFileContents(repos);
}

// Вміст тестових файлів у сховищі. Окремим кроком: з'являється і в уже створеній базі data.db,
// де раніше були лише записи про файли без самих файлів.
function ensureSeedFileContents({ fileRepository, fileStore }) {
  for (const f of SEED_FILES) {
    if (fileRepository.findById(f.id) && !fileStore.pathIfExists(f.id)) {
      fileStore.write(f.id, fs.readFileSync(seedFilePath(f)));
    }
  }
}

// Суперадмін (призначає адмінів). Окремим кроком: з'являється і в уже створеній базі data.db.
function ensureSuperAdmin({ userRepository }) {
  if (userRepository.findByRole(Role.SUPERADMIN)) return;
  if (userRepository.findByLogin('superadmin')) return; // логін зайнятий кимось іншим — нічого не чіпаємо
  userRepository.insert(new User({
    nickname: 'Super Admin', login: 'superadmin', email: 'superadmin@uni.ua',
    passwordHash: bcrypt.hashSync(SEED_PASSWORD, 10), birthDate: new Date('2000-01-01'), role: Role.SUPERADMIN,
  }));
}

function seedDemo({ userRepository, fileRepository, materialRepository, fileStore }) {

  const born = new Date('2005-03-14');
  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const users = [
    new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash, birthDate: born }),
    new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash, birthDate: born }),
    new User({ nickname: 'Admin', login: 'admin1', email: 'admin@uni.ua', passwordHash, birthDate: born, role: Role.ADMIN }),
  ];
  users.forEach((u) => { u.id = userRepository.insert(u); });
  const [anna, julia] = users;

  const authors = { anna, julia };
  const files = SEED_FILES.map((f) => new StoredFile({
    id: f.id, originalName: f.name, mimeType: f.mimeType,
    sizeBytes: fs.statSync(seedFilePath(f)).size, uploadedBy: authors[f.author].id,
  }));
  files.forEach((f) => fileRepository.insert(f));
  SEED_FILES.forEach((f) => fileStore.write(f.id, fs.readFileSync(seedFilePath(f))));
  const [normalization, oop, exam] = files;

  const material = (author, file, fields) => new Material({
    ...fields, authorId: author.id, authorNickname: author.nickname,
    file: new MaterialFile({ fileName: file.originalName, sizeBytes: file.sizeBytes, url: file.url() }),
  });
  [
    material(anna, normalization, { title: 'Нормалізація БД', description: '1НФ–3НФ і НФБК з прикладами таблиць', subject: 'Бази даних', university: 'КПІ', course: 2, type: 'конспект' }),
    material(julia, oop, { title: 'Принципи ООП', description: 'Інкапсуляція, наслідування, поліморфізм, абстракція й SOLID з прикладами на JavaScript', subject: 'ООП', university: 'КПІ', course: 1, type: 'презентація' }),
    material(anna, exam, { title: 'Приклади екзаменаційних питань з БД', description: '15 теоретичних питань і 6 практичних завдань з SQL, до частини — зразки розв’язків', subject: 'Бази даних', university: 'КПІ', course: 2, type: 'практична' }),
  ].forEach((m) => materialRepository.insert(m));
}

module.exports = { seed, SEED_PASSWORD };
