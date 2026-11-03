const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4173);
const BEECEPTOR_PAYMENTS_URL = process.env.BEECEPTOR_PAYMENTS_URL || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const CONFIRMATION_TOKEN = process.env.CONFIRMATION_TOKEN || '';
const publicDir = path.join(__dirname, 'public');
const orders = new Map();
const clients = new Set();
let nextOrderNumber = 1042;
const PRICE_CENTS = 4999;
const WALLET_CENTS = 50000;
const COUPON_CODE = 'ASTER10';

function money(cents) { return (cents / 100).toFixed(2); }
function businessDayAfter(date, count) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  for (let added = 0; added < count;) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) added++;
  }
  return day.toISOString().slice(0, 10);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('Request is too large');
  }
  return JSON.parse(raw || '{}');
}

function publish(order) {
  const data = `data: ${JSON.stringify(order)}\n\n`;
  for (const client of clients) client.write(data);
}

function orderView(order) {
  return {
    orderId: order.orderId,
    amount: order.amount,
    couponCode: order.couponCode,
    discount: order.discount,
    placedAt: order.placedAt,
    estimatedDeliveryStart: order.estimatedDeliveryStart,
    estimatedDeliveryEnd: order.estimatedDeliveryEnd,
    currency: order.currency,
    status: order.status,
    paymentId: order.paymentId,
    walletBalance: order.walletBalance,
    event: order.event,
    webhookReceivedAt: order.webhookReceivedAt,
    error: order.error,
  };
}

async function checkout(req, res) {
  const body = await readJson(req);
  const couponCode = String(body?.couponCode || '').trim().toUpperCase();
  if (couponCode && couponCode !== COUPON_CODE) return json(res, 400, { error: 'That coupon code is not valid.' });
  const discountCents = couponCode ? Math.round(PRICE_CENTS * 0.1) : 0;
  const amountCents = PRICE_CENTS - discountCents;
  const orderId = `ORD-${nextOrderNumber++}`;
  const placedAt = new Date();
  const order = { orderId, amount: money(amountCents), couponCode: couponCode || null, discount: money(discountCents), currency: 'USD', walletBalance: money(WALLET_CENTS), placedAt: placedAt.toISOString(), estimatedDeliveryStart: businessDayAfter(placedAt, 3), estimatedDeliveryEnd: businessDayAfter(placedAt, 5), status: 'processing', paymentId: null, event: null, webhookReceivedAt: null, error: null };
  orders.set(orderId, order);
  publish(orderView(order));
  json(res, 201, { orderId, status: 'processing' });
  void processPayment(order);
}

async function processPayment(order) {
  const { orderId } = order;
  if (!BEECEPTOR_PAYMENTS_URL) {
    await new Promise(resolve => setTimeout(resolve, 550));
    if (orders.get(orderId) !== order) return;
    order.paymentId = 'PAY-9001';
    publish(orderView(order));
    setTimeout(() => {
      if (orders.get(orderId) !== order || order.status !== 'processing') return;
      order.status = 'paid';
      order.walletBalance = money(WALLET_CENTS - Math.round(Number(order.amount) * 100));
      order.event = 'payment.completed';
      order.webhookReceivedAt = new Date().toISOString();
      publish(orderView(order));
    }, Math.floor(2000 + Math.random() * 3001)).unref();
    return;
  }

  try {
    const response = await fetch(BEECEPTOR_PAYMENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amount: order.amount, currency: order.currency, ...(order.couponCode ? { couponCode: order.couponCode, discount: order.discount } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    let paymentResponse;
    try { paymentResponse = JSON.parse(raw); } catch { paymentResponse = { raw }; }
    if (orders.get(orderId) !== order) return;
    if (response.status !== 202 || !paymentResponse.paymentId) {
      order.status = 'error';
      order.error = 'Payment could not be processed. Please try again.';
      publish(orderView(order));
      return;
    }
    order.paymentId = String(paymentResponse.paymentId);
    publish(orderView(order));
  } catch (error) {
    if (orders.get(orderId) !== order) return;
    order.status = 'error';
    order.error = 'Payment could not be processed. Please try again.';
    publish(orderView(order));
  }
}

async function confirmOrder(req, res) {
  const payload = await readJson(req);
  const orderId = payload?.data?.orderId;
  const order = orders.get(orderId);
  if (!order) return json(res, 404, { error: 'Unknown order ID.' });
  if (payload.event !== 'payment.completed' || payload.data.status !== 'succeeded' || !payload.data.paymentId) {
    return json(res, 422, { error: 'Expected a successful payment.completed event.' });
  }
  if (order.paymentId && order.paymentId !== payload.data.paymentId) return json(res, 409, { error: 'Payment ID does not match the response.' });
  if (String(payload.data.amount) !== order.amount || payload.data.currency !== order.currency) return json(res, 409, { error: 'Order amount or currency does not match.' });
  order.paymentId = payload.data.paymentId;
  order.status = 'paid';
  order.walletBalance = money(WALLET_CENTS - Math.round(Number(order.amount) * 100));
  order.event = payload.event;
  order.webhookReceivedAt = new Date().toISOString();
  publish(orderView(order));
  return json(res, 200, { received: true, orderId });
}

async function directWebhook(req, res) {
  if (WEBHOOK_SECRET && req.headers['x-demo-secret'] !== WEBHOOK_SECRET) return json(res, 401, { error: 'Invalid webhook secret.' });
  return confirmOrder(req, res);
}

async function backendConfirmation(req, res) {
  if (!CONFIRMATION_TOKEN) return json(res, 503, { error: 'Confirmation service is not configured.' });
  if (req.headers['x-confirmation-token'] !== CONFIRMATION_TOKEN) return json(res, 401, { error: 'Invalid confirmation token.' });
  return confirmOrder(req, res);
}

async function staticFile(urlPath, res) {
  const files = { '/': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js', '/product.svg': 'product.svg', '/alex-morgan.png': 'alex-morgan.png' };
  const name = files[urlPath];
  if (!name) return json(res, 404, { error: 'Not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const content = await fs.readFile(path.join(publicDir, name));
  res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store' });
  res.end(content);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { liveReady: Boolean(BEECEPTOR_PAYMENTS_URL) });
    if (req.method === 'GET' && url.pathname === '/api/orders') return json(res, 200, [...orders.values()].map(orderView));
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/checkout') return await checkout(req, res);
    if (req.method === 'POST' && url.pathname === '/webhooks/payments') return await directWebhook(req, res);
    if (req.method === 'POST' && url.pathname === '/api/payment-confirmations') return await backendConfirmation(req, res);
    if (req.method === 'POST' && url.pathname === '/api/reset') {
      orders.clear();
      for (const client of clients) client.write('event: reset\ndata: {}\n\n');
      return json(res, 200, { reset: true });
    }
    if (req.method === 'GET') return await staticFile(url.pathname, res);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}).listen(PORT, () => console.log(`Checkout demo: http://localhost:${PORT}`));
