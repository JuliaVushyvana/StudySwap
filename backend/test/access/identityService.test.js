// Юніт-тести identityService і accessService: репозиторії замінено фейками в пам'яті, БД не потрібна.
// bcrypt справжній, але з мінімальною вартістю (rounds = 4), щоб тести йшли швидко.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdentityService } = require('../../service/access/identityService');
const { createAccessService } = require('../../service/access/accessService');
const { createTokenService } = require('../../service/access/tokenService');
const { createPasswordHasher } = require('../../service/access/passwordHasher');
const { ValidationError, UnauthorizedError, ConflictError } = require('../../service/errors');
const { Role } = require('../../domain/access/User');

const NOW = new Date('2026-11-20T10:15:00Z');

function fakeUserRepository() {
  const rows = new Map();
  let nextId = 1;
  const find = (field, value) => [...rows.values()]
    .find((u) => u[field].toLowerCase() === String(value).toLowerCase()) || null;
  return {
    rows,
    findById: (id) => rows.get(id) || null,
    findByLogin: (login) => find('login', login),
    findByEmail: (email) => find('email', email),
    findByNickname: (nickname) => find('nickname', nickname),
    insert: (u) => { const id = nextId++; rows.set(id, u); return id; },
  };
}

function fakeRevokedTokenRepository() {
  const revoked = new Set();
  return { revoke: (jti) => { revoked.add(jti); }, isRevoked: (jti) => revoked.has(jti) };
}

const validBody = () => ({
  nickname: 'Olha', login: 'olha_m', email: 'olha@uni.ua', password: 'secret123', birthDate: '2004-05-01',
});

function setup({ now = () => NOW } = {}) {
  const userRepository = fakeUserRepository();
  const tokenService = createTokenService({ secret: 'test-secret', ttlSeconds: 3600, revokedTokenRepository: fakeRevokedTokenRepository(), now });
  const passwordHasher = createPasswordHasher({ rounds: 4 });
  const identity = createIdentityService({ userRepository, passwordHasher, tokenService, now });
  const access = createAccessService({ userRepository, tokenService });
  return { identity, access, userRepository };
}

// Перевіряє, що use-case кидає ValidationError з потрібними полями й кодами
async function assertInvalid(promise, expected) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ValidationError);
    const got = Object.fromEntries(err.details.map((d) => [d.field, true]));
    for (const field of Object.keys(expected)) assert.ok(got[field], `очікувалася помилка поля ${field}`);
    return true;
  });
}

// ---------- register ----------

test('register: коректні дані → 201-відповідь без passwordHash, роль user, пароль збережено як bcrypt-хеш', async () => {
  const { identity, userRepository } = setup();
  const res = await identity.register(validBody());

  assert.deepEqual(res, {
    id: 1, nickname: 'Olha', login: 'olha_m', email: 'olha@uni.ua', birthDate: '2004-05-01', avatarUrl: null, role: 'user',
  });
  assert.ok(!('passwordHash' in res));
  const stored = userRepository.findById(1);
  assert.notEqual(stored.passwordHash, 'secret123');
  assert.match(stored.passwordHash, /^\$2[aby]\$04\$/);
});

test('register: роль із тіла не приймається — 400 UNKNOWN_FIELD, адміна не створено', async () => {
  const { identity, userRepository } = setup();
  await assert.rejects(identity.register({ ...validBody(), role: Role.ADMIN }), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.code, 'UNKNOWN_FIELD');
    assert.deepEqual(err.details.map((d) => d.field), ['role']);
    return true;
  });
  assert.equal(userRepository.rows.size, 0);
});

test('register: межі довжини nickname 3..30 і login 5..32', async () => {
  const { identity } = setup();
  await assertInvalid(identity.register({ ...validBody(), nickname: 'Ol' }), { nickname: 1 });
  await assertInvalid(identity.register({ ...validBody(), nickname: 'x'.repeat(31) }), { nickname: 1 });
  await assertInvalid(identity.register({ ...validBody(), login: 'abcd' }), { login: 1 });
  await assertInvalid(identity.register({ ...validBody(), login: 'a'.repeat(33) }), { login: 1 });

  const ok = await identity.register({ ...validBody(), nickname: 'Oli', login: 'a'.repeat(32) });
  assert.equal(ok.login.length, 32);
});

test('register: некоректні email, пароль і дата народження → 400 з кодами полів', async () => {
  const { identity } = setup();
  const cases = [
    [{ email: 'olha.uni.ua' }, 'INVALID_EMAIL'],
    [{ login: 'olha@uni' }, 'INVALID_LOGIN'],
    [{ password: 'short' }, 'PASSWORD_TOO_SHORT'],
    [{ password: 'я'.repeat(40) }, 'PASSWORD_TOO_LONG'], // 80 байт > 72
    [{ birthDate: '2027-01-01' }, 'INVALID_BIRTH_DATE'],
    [{ birthDate: '2004-02-30' }, 'INVALID_BIRTH_DATE'],
    [{ birthDate: '01.05.2004' }, 'INVALID_BIRTH_DATE'],
  ];
  for (const [patch, code] of cases) {
    await assert.rejects(identity.register({ ...validBody(), ...patch }), (err) => {
      assert.ok(err instanceof ValidationError, JSON.stringify(patch));
      assert.equal(err.code, code, JSON.stringify(patch));
      return true;
    });
  }
});

test('register: порожнє тіло → 400 з усіма обов\'язковими полями', async () => {
  const { identity } = setup();
  await assertInvalid(identity.register({}), { nickname: 1, login: 1, email: 1, password: 1, birthDate: 1 });
  await assertInvalid(identity.register(null), { body: 1 });
});

test('register: дубль логіна (без урахування регістру) → 409 LOGIN_TAKEN', async () => {
  const { identity } = setup();
  await identity.register(validBody());
  await assert.rejects(
    identity.register({ ...validBody(), login: 'OLHA_M', nickname: 'Other', email: 'other@uni.ua' }),
    (err) => err instanceof ConflictError && err.code === 'LOGIN_TAKEN',
  );
});

test('register: дубль нікнейма чи пошти → 409 NICKNAME_TAKEN / EMAIL_TAKEN', async () => {
  const { identity } = setup();
  await identity.register(validBody());
  await assert.rejects(
    identity.register({ ...validBody(), login: 'other_1', email: 'other@uni.ua' }),
    (err) => err instanceof ConflictError && err.code === 'NICKNAME_TAKEN',
  );
  await assert.rejects(
    identity.register({ ...validBody(), login: 'other_1', nickname: 'Other', email: 'OLHA@uni.ua' }),
    (err) => err instanceof ConflictError && err.code === 'EMAIL_TAKEN',
  );
});

// ---------- login ----------

test('login: правильні логін і пароль → токен Bearer і користувач без passwordHash', async () => {
  const { identity, access } = setup();
  await identity.register(validBody());
  const res = await identity.login({ login: 'olha_m', password: 'secret123' });

  assert.equal(res.tokenType, 'Bearer');
  assert.equal(res.expiresIn, 3600);
  assert.equal(res.user.login, 'olha_m');
  assert.ok(!('passwordHash' in res.user));
  assert.equal(access.authenticate(res.accessToken).nickname, 'Olha');
});

test('login: вхід через пошту теж працює', async () => {
  const { identity } = setup();
  await identity.register(validBody());
  const res = await identity.login({ login: 'Olha@Uni.ua', password: 'secret123' });
  assert.equal(res.user.id, 1);
});

test('login: неправильний пароль → 401 INVALID_CREDENTIALS', async () => {
  const { identity } = setup();
  await identity.register(validBody());
  await assert.rejects(
    identity.login({ login: 'olha_m', password: 'wrong-password' }),
    (err) => err instanceof UnauthorizedError && err.code === 'INVALID_CREDENTIALS',
  );
});

test('login: неіснуючий логін → та сама 401, що й неправильний пароль', async () => {
  const { identity } = setup();
  await assert.rejects(
    identity.login({ login: 'nobody', password: 'secret123' }),
    (err) => err instanceof UnauthorizedError && err.code === 'INVALID_CREDENTIALS',
  );
});

test('login: заблокований користувач не входить → 401', async () => {
  const { identity, userRepository } = setup();
  await identity.register(validBody());
  userRepository.findById(1).isBlocked = true;
  await assert.rejects(identity.login({ login: 'olha_m', password: 'secret123' }), UnauthorizedError);
});

test('login: без логіна чи пароля → 400', async () => {
  const { identity } = setup();
  await assertInvalid(identity.login({ password: 'secret123' }), { login: 1 });
  await assertInvalid(identity.login({ login: 'olha_m' }), { password: 1 });
});

// ---------- токен і logout ----------

test('logout: після виходу токен більше не приймається, повторний вихід → 401', async () => {
  const { identity, access } = setup();
  await identity.register(validBody());
  const { accessToken } = await identity.login({ login: 'olha_m', password: 'secret123' });
  const user = access.authenticate(accessToken);

  identity.logout(user, accessToken);
  assert.equal(access.authenticate(accessToken), null);
  assert.throws(() => identity.logout(null, accessToken), UnauthorizedError);
});

test('authenticate: підроблений, чужим ключем підписаний або прострочений токен → null (гість)', async () => {
  let now = NOW;
  const { identity, access } = setup({ now: () => now });
  await identity.register(validBody());
  const { accessToken } = await identity.login({ login: 'olha_m', password: 'secret123' });

  const foreign = createTokenService({ secret: 'other-secret', revokedTokenRepository: fakeRevokedTokenRepository() })
    .issue({ id: 1, role: 'admin' }).token;
  assert.equal(access.authenticate(foreign), null);
  assert.equal(access.authenticate(`${accessToken}x`), null);
  assert.equal(access.authenticate('dev-token-anna'), null);

  now = new Date(NOW.getTime() + 3601 * 1000);
  assert.equal(access.authenticate(accessToken), null);
});
