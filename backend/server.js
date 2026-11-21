const { openDatabase } = require('./db');
const { createApp } = require('./app');
const { config } = require('./config');

const server = createApp(openDatabase(), config).listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}${config.chaos ? ' (CHAOS: штучні затримки й збої)' : ''}`);
});

// Обриваємо з'єднання, які надсилають запит повільніше, ніж за 2 таймаути обробки
server.requestTimeout = config.requestTimeoutMs * 2;
