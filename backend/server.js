const { openDatabase } = require('./db');
const { createApp } = require('./app');
const { config } = require('./config');

const server = createApp(openDatabase(config.dbFile), config).listen(config.port, () => {
  const { errorRate, delayMs } = config.fault;
  const fault = errorRate > 0 || delayMs > 0 ? ` (FAULT: ${errorRate * 100}% збоїв 500, затримка ${delayMs} мс)` : '';
  console.log(`Server running on http://localhost:${config.port}${config.chaos ? ' (CHAOS: штучні затримки й збої)' : ''}${fault}`);
});

// Обриваємо з'єднання, які надсилають запит повільніше, ніж за 2 таймаути обробки
server.requestTimeout = config.requestTimeoutMs * 2;
