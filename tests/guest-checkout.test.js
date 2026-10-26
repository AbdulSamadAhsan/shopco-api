const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Order } = require('../models/Order');
const payments = require('../services/paymentService');
const routes = require('../routes/paymentRoutes');
const { errorHandler } = require('../middleware/errorHandler');
const { createHash } = require('node:crypto');

afterEach(() => mock.restoreAll());

test('guest orders validate without an account but cannot omit all ownership', () => {
  const guest = new Order({ guestTokenHash: 'a'.repeat(64), user: null, idempotencyKey: 'guest-order-key' });
  assert.equal(guest.validateSync(), undefined);
  const ownerless = new Order({ idempotencyKey: 'order-key' });
  assert.ok(ownerless.validateSync().errors.user);
});

test('guest payment routes pass the same owner to start, status and cancellation; bad JWT cannot downgrade', async t => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'guest-checkout-test-secret-at-least-32-characters';
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const owner = { guestTokenHash: createHash('sha256').update('c'.repeat(64)).digest('hex') };
  mock.method(payments, 'startCheckout', async received => { assert.deepEqual(received, owner); return { sessionId: 'cs_test_guest' }; });
  mock.method(payments, 'checkoutStatus', async received => { assert.deepEqual(received, owner); return { paid: false, status: 'open' }; });
  mock.method(payments, 'cancelCheckout', async received => { assert.deepEqual(received, owner); return { paid: false, status: 'expired' }; });
  const app = express(); app.use(express.json()); app.use('/api/pay', routes); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}/api/pay/checkout`;
  const headers = { 'x-cart-token': 'c'.repeat(64), 'content-type': 'application/json', 'idempotency-key': 'guest-payment-key' };
  assert.equal((await fetch(root, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(root + '/cs_test_guest', { headers })).status, 200);
  assert.equal((await fetch(root + '/cs_test_guest/cancel', { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(root, { method: 'POST', headers: { ...headers, authorization: 'Bearer invalid' }, body: '{}' })).status, 401);
  assert.equal(payments.startCheckout.mock.callCount(), 1);
});
