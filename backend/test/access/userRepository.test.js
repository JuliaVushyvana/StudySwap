// Інтеграційний тест репозиторію users на SQLite у пам'яті: міграція й унікальні індекси.

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { createUserRepository } = require('../../service/access/userRepository');
const { ConflictError } = require('../../service/errors');
const { User } = require('../../domain/access/User');

const user = (nickname, login, email) => User.register({
  nickname, login, email, passwordHash: 'hash', birthDate: new Date('2004-05-01'),
});

test('userRepository: nickname, login і email унікальні без урахування регістру → ConflictError', () => {
  const repo = createUserRepository(new Database(':memory:'));
  repo.insert(user('Olha', 'olha_m', 'olha@uni.ua'));

  const cases = [
    [user('OLHA', 'other_1', 'o1@uni.ua'), 'NICKNAME_TAKEN'],
    [user('Other1', 'Olha_M', 'o2@uni.ua'), 'LOGIN_TAKEN'],
    [user('Other2', 'other_2', 'OLHA@UNI.UA'), 'EMAIL_TAKEN'],
  ];
  for (const [u, code] of cases) {
    assert.throws(() => repo.insert(u), (err) => err instanceof ConflictError && err.code === code);
  }
  assert.equal(repo.count(), 1);
});

test('userRepository: пошук за логіном і поштою повертає доменний User', () => {
  const repo = createUserRepository(new Database(':memory:'));
  const id = repo.insert(user('Olha', 'olha_m', 'olha@uni.ua'));

  const byLogin = repo.findByLogin('OLHA_M');
  assert.ok(byLogin instanceof User);
  assert.equal(byLogin.id, id);
  assert.equal(repo.findByEmail('Olha@Uni.ua').id, id);
  assert.equal(repo.findByLogin('nobody'), null);
});

test('userRepository: міграція додає індекси до вже наявної таблиці й не ламає повторний запуск', () => {
  const db = new Database(':memory:');
  createUserRepository(db);
  createUserRepository(db); // другий запуск застосунку з тим самим data.db
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all().map((r) => r.name);
  for (const name of ['users_nickname_uq', 'users_login_uq', 'users_email_uq']) assert.ok(indexes.includes(name), name);
});
