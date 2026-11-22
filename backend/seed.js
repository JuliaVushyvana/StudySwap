// Тестові дані для локального запуску: користувачі, завантажені файли й кілька матеріалів.

const bcrypt = require('bcryptjs');
const { User, Role } = require('./domain/access/User');
const { StoredFile } = require('./domain/storage/StoredFile');
const { Material, MaterialFile } = require('./domain/catalog/Material');

const MB = 1024 * 1024;
// Спільний пароль тестових акаунтів anna_k, julia_v, admin1 (див. README)
const SEED_PASSWORD = 'studyswap123';

function seed({ userRepository, fileRepository, materialRepository }) {
  if (userRepository.count() > 0) return;

  const born = new Date('2005-03-14');
  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const users = [
    new User({ nickname: 'Anna', login: 'anna_k', email: 'anna@uni.ua', passwordHash, birthDate: born }),
    new User({ nickname: 'Julia', login: 'julia_v', email: 'julia@uni.ua', passwordHash, birthDate: born }),
    new User({ nickname: 'Admin', login: 'admin1', email: 'admin@uni.ua', passwordHash, birthDate: born, role: Role.ADMIN }),
  ];
  users.forEach((u) => { u.id = userRepository.insert(u); });
  const [anna, julia] = users;

  const files = [
    new StoredFile({ id: 'f-8c1e2b', originalName: 'normalization.pdf', mimeType: 'application/pdf', sizeBytes: 2 * MB, uploadedBy: anna.id }),
    new StoredFile({ id: 'f-oop01', originalName: 'oop-principles.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sizeBytes: 8 * MB, uploadedBy: julia.id }),
    new StoredFile({ id: 'f-exam01', originalName: 'db-exam-questions.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: MB / 2, uploadedBy: anna.id }),
    new StoredFile({ id: 'f-free01', originalName: 'architecture-lab1.pdf', mimeType: 'application/pdf', sizeBytes: 3 * MB, uploadedBy: anna.id }),
  ];
  files.forEach((f) => fileRepository.insert(f));

  const material = (author, file, fields) => new Material({
    ...fields, authorId: author.id, authorNickname: author.nickname,
    file: new MaterialFile({ fileName: file.originalName, sizeBytes: file.sizeBytes, url: file.url() }),
  });
  [
    material(anna, files[0], { title: 'Нормалізація БД', description: '1НФ–3НФ з прикладами', subject: 'Бази даних', university: 'КПІ', course: 2, type: 'конспект' }),
    material(julia, files[1], { title: 'Принципи ООП', subject: 'ООП', university: 'КПІ', course: 1, type: 'презентація' }),
    material(anna, files[2], { title: 'Приклади екзаменаційних питань з БД', subject: 'Бази даних', university: 'КПІ', course: 2, type: 'практична' }),
  ].forEach((m) => materialRepository.insert(m));
}

module.exports = { seed, SEED_PASSWORD };
