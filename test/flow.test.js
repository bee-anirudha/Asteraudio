const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomInt } = require('node:crypto');
const { spawn } = require('node:child_process');

test('acknowledgment and webhook are separate payment stages', async () => {
  const sentOrderIds = [];
  let upstreamResponded = false;
  const beeceptor = http.createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/payments');
    let body = '';
    for await (const chunk of req) body += chunk;
    const payment = JSON.parse(body);
    sentOrderIds.push(payment.orderId);
    assert.equal(payment.orderId, 'ORD-F69693418B65');
    assert.deepEqual(payment, sentOrderIds.length === 1
      ? { orderId: payment.orderId, amount: '49.99', currency: 'USD' }
      : { orderId: payment.orderId, amount: '44.99', currency: 'USD', couponCode: 'ASTER10', discount: '5.00' });
    await new Promise(resolve => setTimeout(resolve, 600));
    upstreamResponded = true;
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ paymentId: `PAY-${payment.orderId}`, status: 'processing' }));
  });
  await new Promise(resolve => beeceptor.listen(0, '127.0.0.1', resolve));
  const beeceptorPort = beeceptor.address().port;
  const appPort = randomInt(20000, 30000);
  const app = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(appPort), BEECEPTOR_PAYMENTS_URL: `http://127.0.0.1:${beeceptorPort}/payments`, CONFIRMATION_TOKEN: 'local-test-token' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${appPort}`;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await fetch(`${base}/api/config`); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.deepEqual(await (await fetch(`${base}/api/orders`)).json(), []);
    const checkout = await fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(checkout.status, 201);
    const firstOrder = await checkout.json();
    assert.equal(firstOrder.orderId, 'ORD-F69693418B65');
    assert.equal(firstOrder.status, 'processing');
    assert.equal(upstreamResponded, false, 'order ID is returned before the payment API responds');
    let orders = await (await fetch(`${base}/api/orders`)).json();
    assert.equal(orders[0].status, 'processing');
    assert.equal(orders[0].walletBalance, '500.00');
    for (let attempt = 0; attempt < 30 && !orders[0].paymentId; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      orders = await (await fetch(`${base}/api/orders`)).json();
    }
    assert.equal(orders[0].paymentId, `PAY-${firstOrder.orderId}`);

    const directWebhook = await fetch(`${base}/webhooks/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(directWebhook.status, 404, 'Beeceptor must send its callout to the separate backend');
    const unauthorized = await fetch(`${base}/api/payment-confirmations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'payment.completed', data: { orderId: firstOrder.orderId, paymentId: `PAY-${firstOrder.orderId}`, amount: '49.99', currency: 'USD', status: 'succeeded' } }) });
    assert.equal(unauthorized.status, 401);
    const confirmationHeaders = { 'Content-Type': 'application/json', 'X-Confirmation-Token': 'local-test-token' };
    const wrong = await fetch(`${base}/api/payment-confirmations`, { method: 'POST', headers: confirmationHeaders, body: JSON.stringify({ event: 'payment.completed', data: { orderId: firstOrder.orderId, paymentId: 'OTHER', amount: '49.99', currency: 'USD', status: 'succeeded' } }) });
    assert.equal(wrong.status, 409);
    orders = await (await fetch(`${base}/api/orders`)).json();
    assert.equal(orders[0].status, 'processing');
    assert.equal(orders[0].walletBalance, '500.00');

    const webhook = await fetch(`${base}/api/payment-confirmations`, { method: 'POST', headers: confirmationHeaders, body: JSON.stringify({ event: 'payment.completed', data: { orderId: firstOrder.orderId, paymentId: `PAY-${firstOrder.orderId}`, amount: '49.99', currency: 'USD', status: 'succeeded' } }) });
    assert.equal(webhook.status, 200);
    orders = await (await fetch(`${base}/api/orders`)).json();
    assert.equal(orders[0].status, 'paid');
    assert.equal(orders[0].walletBalance, '450.01');
    assert.equal(orders[0].event, 'payment.completed');

    await fetch(`${base}/api/reset`, { method: 'POST' });
    const invalid = await fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ couponCode: 'WRONG' }) });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/orders`)).json(), []);
    const nextCheckout = await fetch(`${base}/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ couponCode: 'aster10' }) });
    assert.equal(nextCheckout.status, 201);
    const secondOrder = await nextCheckout.json();
    assert.equal(secondOrder.orderId, firstOrder.orderId);
    orders = await (await fetch(`${base}/api/orders`)).json();
    assert.equal(orders[0].amount, '44.99');
    assert.equal(orders[0].discount, '5.00');
    for (let attempt = 0; attempt < 30 && !orders[0].paymentId; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      orders = await (await fetch(`${base}/api/orders`)).json();
    }
    assert.equal(orders[0].paymentId, `PAY-${secondOrder.orderId}`);
    const discountedWebhook = await fetch(`${base}/api/payment-confirmations`, { method: 'POST', headers: confirmationHeaders, body: JSON.stringify({ event: 'payment.completed', data: { orderId: secondOrder.orderId, paymentId: `PAY-${secondOrder.orderId}`, amount: '44.99', currency: 'USD', status: 'succeeded' } }) });
    assert.equal(discountedWebhook.status, 200);
    orders = await (await fetch(`${base}/api/orders`)).json();
    assert.equal(orders[0].walletBalance, '455.01');
  } finally {
    app.kill();
    await new Promise(resolve => beeceptor.close(resolve));
  }
});
