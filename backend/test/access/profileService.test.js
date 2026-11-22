// Юніт-тести профілю: свої дані, зміна пароля. Репозиторій і хешування — фейки (без БД і bcrypt).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createProfileService } = require('../../service/access/profileService');
const { ValidationError, UnauthorizedError, ConflictError } = require('../../service/errors');
const { User } = require('../../domain/access/User');

const born = new Date('2005-03-14');
const mk = (id, nickname, login, email) => Object.assign(new User({ nickname, login, email, passwordHash: 'hash:studyswap123', birthDate: born }), { id });

function setup() {
  const users = [mk(1, 'Anna', 'anna_k', 'anna@uni.ua'), mk(2, 'Julia', 'julia_v', 'julia@uni.ua')];
  const by = (field) => (v) => users.find((u) => u[field].toLowerCase() === String(v).toLowerCase()) || null;
  const userRepository = { findByNickname: by('nickname'), findByEmail: by('email'), update: () => {} };
  const passwordHasher = { hash: async (p) => `hash:${p}`, verify: async (p, h) => h === `hash:${p}` };
  return { service: createProfileService({ userRepository, passwordHasher }), anna: users[0] };
}

test('me: свої дані без пароля; гість → 401', () => {
  const { service, anna } = setup();
  const me = service.me(anna);
  assert.equal(me.nickname, 'Anna');
  assert.equal('passwordHash' in me, false);
  assert.throws(() => service.me(null), UnauthorizedError);
});

test('updateMe: змінює нікнейм і пошту', () => {
  const { service, anna } = setup();
  const me = service.updateMe(anna, { nickname: 'Anna K', email: 'anna.k@uni.ua' });
  assert.equal(me.nickname, 'Anna K');
  assert.equal(me.email, 'anna.k@uni.ua');
});

test('updateMe: чужий нікнейм → 409, свій той самий — можна; логін змінити не можна', () => {
  const { service, anna } = setup();
  assert.throws(() => service.updateMe(anna, { nickname: 'julia' }), ConflictError);
  assert.equal(service.updateMe(anna, { nickname: 'Anna' }).nickname, 'Anna');
  assert.throws(() => service.updateMe(anna, { login: 'hacker' }), (e) => e instanceof ValidationError);
  assert.throws(() => service.updateMe(anna, {}), (e) => e.code === 'EMPTY_UPDATE');
});

test('changePassword: потрібен правильний поточний пароль', async () => {
  const { service, anna } = setup();
  await assert.rejects(service.changePassword(anna, { currentPassword: 'wrong', newPassword: 'newpassword1' }), (e) => e.code === 'WRONG_PASSWORD');
  await assert.rejects(service.changePassword(anna, { currentPassword: 'studyswap123', newPassword: 'short' }), (e) => e.code === 'PASSWORD_TOO_SHORT');
  await service.changePassword(anna, { currentPassword: 'studyswap123', newPassword: 'newpassword1' });
  assert.equal(anna.passwordHash, 'hash:newpassword1');
});
