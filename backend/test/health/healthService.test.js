const test = require('node:test');
const assert = require('node:assert/strict');

const { createHealthService } = require('../../service/health/healthService');

test('health: усі перевірки пройшли → ok, одна впала → degraded', () => {
  assert.deepEqual(createHealthService({ probes: { database: () => {} } }).check(), { status: 'ok', checks: { database: 'ok' } });

  const broken = createHealthService({ probes: { database: () => { throw new Error('SQLITE_CANTOPEN'); } } });
  assert.deepEqual(broken.check(), { status: 'degraded', checks: { database: 'fail' } });
});
