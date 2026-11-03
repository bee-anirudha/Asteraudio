const http = require('node:http');

const RELAY_PORT = Number(process.env.RELAY_PORT || 4174);
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4173';

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('webhook relay ready');
  }
  if (req.method !== 'POST' || req.url !== '/webhooks/payments') {
    console.log(`Rejected ${req.method} ${req.url}`);
    res.writeHead(404);
    return res.end();
  }

  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 64_000) throw new Error('Webhook is too large');
    }
    const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    if (req.headers['x-demo-secret']) headers['X-Demo-Secret'] = req.headers['x-demo-secret'];
    const response = await fetch(`${APP_URL}/webhooks/payments`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    console.log(`Webhook received; app returned ${response.status}; body: ${body}`);
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
    res.end(await response.text());
  } catch (error) {
    console.error(`Webhook relay failed: ${error.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}).listen(RELAY_PORT, '127.0.0.1', () => console.log(`Webhook relay: http://127.0.0.1:${RELAY_PORT}`));
