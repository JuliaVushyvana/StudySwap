// Найпростіший приймач webhook-сповіщень Grafana (Практика 8): друкує в консоль, який алерт і в якому стані.
// Запуск на хості: node observability/alert-webhook.js   (порт 9999, змінити: PORT=9998)
// Contact point у docs/alerts.yaml шле сюди: http://host.docker.internal:9999/alert

const http = require('http');

const PORT = Number(process.env.PORT) || 9999;

http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const time = new Date().toLocaleTimeString();
    try {
      const msg = JSON.parse(body || '{}');
      console.log(`\n[${time}] ${req.method} ${req.url} — ${msg.status || '?'} (${(msg.alerts || []).length} алерт(и))`);
      for (const a of msg.alerts || []) {
        console.log(`  ${a.status === 'firing' ? '🔥 FIRING ' : '✅ RESOLVED'} ${a.labels?.alertname} — ${a.annotations?.summary || ''}`);
      }
    } catch {
      console.log(`\n[${time}] ${req.method} ${req.url} — не JSON:`, body.slice(0, 300));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
}).listen(PORT, () => console.log(`Webhook для Grafana слухає http://localhost:${PORT}/alert`));
