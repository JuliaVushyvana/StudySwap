const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());

app.get('/items', (req, res) => {
  const items = db.prepare('SELECT id, name FROM items').all();
  res.json(items);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
