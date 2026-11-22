// Токени доступу JWT (HS256): issue — після входу, verify — на кожному запиті, revoke — при виході.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function createTokenService({ secret, ttlSeconds = 3600, revokedTokenRepository, now = () => new Date() }) {
  if (!secret) throw new Error('tokenService: потрібен secret для підпису JWT');

  // Повертає payload { userId, role, jti, expiresAt } або null, якщо токен недійсний, прострочений чи відкликаний
  const decode = (token) => {
    if (typeof token !== 'string' || !token) return null;
    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(now().getTime() / 1000),
      });
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || !payload.jti) return null;
      return { userId, role: payload.role, jti: payload.jti, expiresAt: new Date(payload.exp * 1000) };
    } catch {
      return null;
    }
  };

  return {
    issue(user) {
      const iat = Math.floor(now().getTime() / 1000);
      const token = jwt.sign(
        { sub: String(user.id), role: user.role, jti: crypto.randomUUID(), iat, exp: iat + ttlSeconds },
        secret,
        { algorithm: 'HS256' },
      );
      return { token, expiresIn: ttlSeconds };
    },

    verify(token) {
      const payload = decode(token);
      if (!payload || revokedTokenRepository.isRevoked(payload.jti)) return null;
      return payload;
    },

    // Повертає false, якщо токен і так недійсний
    revoke(token) {
      const payload = decode(token);
      if (!payload) return false;
      revokedTokenRepository.revoke(payload.jti, payload.expiresAt, now());
      return true;
    },
  };
}

module.exports = { createTokenService };
