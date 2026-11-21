// Стан сервера для GET /health: перевіряє кожну залежність окремо.

// probes: { назва: () => void } — перевірка кидає помилку, якщо залежність недоступна
function createHealthService({ probes }) {
  return {
    check() {
      const checks = {};
      for (const [name, probe] of Object.entries(probes)) {
        try {
          probe();
          checks[name] = 'ok';
        } catch {
          checks[name] = 'fail';
        }
      }
      const healthy = Object.values(checks).every((s) => s === 'ok');
      return { status: healthy ? 'ok' : 'degraded', checks };
    },
  };
}

// Перевірка SQLite найпростішим запитом
const databaseProbe = (db) => () => db.prepare('SELECT 1').get();

module.exports = { createHealthService, databaseProbe };
