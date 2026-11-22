// Хешування паролів bcrypt. У БД потрапляє лише хеш, сам пароль ніде не зберігається.

const bcrypt = require('bcryptjs');

function createPasswordHasher({ rounds = 10 } = {}) {
  return {
    hash: (password) => bcrypt.hash(password, rounds),
    verify: (password, hash) => bcrypt.compare(password, hash),
  };
}

module.exports = { createPasswordHasher };
