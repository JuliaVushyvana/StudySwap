const { openDatabase } = require('./db');
const { createApp } = require('./app');

const PORT = 3000;

createApp(openDatabase()).listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
