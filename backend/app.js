// Точка збирання застосунку: створює репозиторії й сервіси модулів і підключає роути.

const express = require('express');
const cors = require('cors');

const { createUserRepository } = require('./service/access/userRepository');
const { createRevokedTokenRepository } = require('./service/access/revokedTokenRepository');
const { createAccessService, accessPolicy } = require('./service/access/accessService');
const { createIdentityService } = require('./service/access/identityService');
const { createTokenService } = require('./service/access/tokenService');
const { createPasswordHasher } = require('./service/access/passwordHasher');
const { createFileRepository } = require('./service/storage/fileRepository');
const { createStorageService } = require('./service/storage/storageService');
const { createFileStore } = require('./service/storage/fileStore');
const { createFilesRouter } = require('./api/storage/filesRouter');
const { createMaterialRepository } = require('./service/catalog/materialRepository');
const { createMaterialService } = require('./service/catalog/materialService');
const { createIdempotencyRepository } = require('./service/idempotency/idempotencyRepository');
const { createIdempotencyService } = require('./service/idempotency/idempotencyService');
const { createHealthService, databaseProbe } = require('./service/health/healthService');

const { requestId } = require('./api/middleware/requestId');
const { authenticate } = require('./api/middleware/auth');
const { errorHandler, notFound } = require('./api/middleware/errorHandler');
const { createRateLimiter } = require('./api/middleware/rateLimit');
const { requestTimeout } = require('./api/middleware/timeout');
const { createFaultInjection } = require('./api/middleware/faultInjection');
const { createAuthRouter } = require('./api/access/authRouter');
const { createUsersRouter } = require('./api/access/usersRouter');
const { createProfileService } = require('./service/access/profileService');
const { createRoleService } = require('./service/access/roleService');
const { createMaterialsRouter } = require('./api/catalog/materialsRouter');
const { createHealthRouter } = require('./api/health/healthRouter');
const { seed } = require('./seed');
const { config: defaultConfig } = require('./config');

function createApp(db, config = defaultConfig) {
  const userRepository = createUserRepository(db);
  const revokedTokenRepository = createRevokedTokenRepository(db);
  const fileRepository = createFileRepository(db);
  const materialRepository = createMaterialRepository(db);
  const idempotencyRepository = createIdempotencyRepository(db);
  seed({ userRepository, fileRepository, materialRepository });

  const tokenService = createTokenService({
    secret: config.jwtSecret, ttlSeconds: config.tokenTtlSeconds, revokedTokenRepository,
  });
  const passwordHasher = createPasswordHasher({ rounds: config.bcryptRounds });
  const accessService = createAccessService({ userRepository, tokenService });
  const identityService = createIdentityService({ userRepository, passwordHasher, tokenService });
  const profileService = createProfileService({ userRepository, passwordHasher });
  const roleService = createRoleService({ userRepository });
  const storageService = createStorageService({ fileRepository, accessPolicy, fileStore: createFileStore(config.filesDir || defaultConfig.filesDir) });
  const idempotencyService = createIdempotencyService({ idempotencyRepository });
  const materialService = createMaterialService({ materialRepository, storageService, idempotencyService, accessPolicy, userDirectory: accessService });
  const healthService = createHealthService({ probes: { database: databaseProbe(db) } });

  const app = express();
  // requestId перед cors: X-Request-Id потрапляє й у відповіді на preflight (OPTIONS), які cors завершує сам
  app.use(requestId);
  // Браузер має право надсилати Idempotency-Key і X-Request-Id та читати X-Request-Id і Retry-After
  app.use(cors({ exposedHeaders: ['X-Request-Id', 'Retry-After'] }));
  app.use(requestTimeout(config.requestTimeoutMs));

  // /health не обмежується лімітом і не ламається штучно: моніторинг має бачити справжній стан
  app.use('/health', createHealthRouter({ healthService }));

  app.use(createRateLimiter(config.rateLimit));
  if (config.chaos) app.use(createFaultInjection({}));
  app.use(express.json());
  app.use(authenticate(accessService));

  app.use('/auth', createAuthRouter({ identityService }));
  app.use('/users', createUsersRouter({ profileService, roleService, materialService }));
  app.use('/materials', createMaterialsRouter({ materialService }));
  app.use('/files', createFilesRouter({ storageService }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
