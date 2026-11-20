// Точка збирання застосунку: створює репозиторії й сервіси модулів і підключає роути.

const express = require('express');
const cors = require('cors');

const { createUserRepository } = require('./service/access/userRepository');
const { createAccessService } = require('./service/access/accessService');
const { createFileRepository } = require('./service/storage/fileRepository');
const { createStorageService } = require('./service/storage/storageService');
const { createMaterialRepository } = require('./service/catalog/materialRepository');
const { createMaterialService } = require('./service/catalog/materialService');

const { requestId } = require('./api/middleware/requestId');
const { authenticate } = require('./api/middleware/auth');
const { errorHandler, notFound } = require('./api/middleware/errorHandler');
const { createMaterialsRouter } = require('./api/catalog/materialsRouter');
const { createHealthRouter } = require('./api/health/healthRouter');
const { seed } = require('./seed');

function createApp(db) {
  const userRepository = createUserRepository(db);
  const fileRepository = createFileRepository(db);
  const materialRepository = createMaterialRepository(db);
  seed({ userRepository, fileRepository, materialRepository });

  const accessService = createAccessService({ userRepository });
  const storageService = createStorageService({ fileRepository });
  const materialService = createMaterialService({ materialRepository, storageService });

  const app = express();
  app.use(cors());
  app.use(requestId);
  app.use(express.json());
  app.use(authenticate(accessService));

  app.use('/health', createHealthRouter());
  app.use('/materials', createMaterialsRouter({ materialService }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
