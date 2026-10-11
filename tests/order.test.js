const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Product } = require('../models/Product');
const { Order } = require('../models/Order');
const { Cart } = require('../models/Cart');
const { User } = require('../models/User');
const { validateOrder } = require('../services/orderValidation');
const { createOrder } = require('../services/orderService');
const { errorHandler } = require('../middleware/errorHandler');
const routes = require('../routes/orderRoutes');
const { mock } = require('node:test');
const productId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const userId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const key = 'checkout-key-123';
function body() {
  return {
    items: [{ productId, quantity: 2, size: 'M', color: 'Black' }],
    shipping: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '123456789', address: '1 Main Street', city: 'London', state: 'London', zip: '12345', country: 'UK' },
    promoCode: 'WELCOME20',
  };
}
function fixtures() {
  const session = { withTransaction: mock.fn(async (fn) => fn()), endSession: mock.fn(async () => {}) };
  mock.method(mongoose, 'startSession', async () => session);
  mock.method(Order, 'findOne', async () => null);
  const product = { _id: productId, name: 'Shirt', image: '/shirt.jpg', price: 20, stock: 10, sizes: ['M'], colors: ['Black'] };
  mock.method(Product, 'find', () => ({ session: () => ({ lean: async () => [product] }) }));
  mock.method(Product, 'updateOne', async () => ({ modifiedCount: 1 }));
  mock.method(Order, 'create', async ([data]) => [{ _id: 'cccccccccccccccccccccccc', status: 'pending', paymentStatus: 'unpaid', ...data }]);
  mock.method(Cart, 'updateOne', async () => ({ modifiedCount: 1 }));
  return { session, product };
}
afterEach(() => mock.restoreAll());

test('invalid requests fail before database access', async () => {
  const lookup = mock.method(Order, 'findOne', async () => { throw new Error('Must not query'); });
  const invalid = [null, {}, { ...body(), items: [] }, { ...body(), shipping: {} }, { ...body(), paymentMethod: 'card' }, { ...body(), promoCode: {} }];
  for (const quantity of [-1, 0, 1.5, '2', 10001]) invalid.push({ ...body(), items: [{ ...body().items[0], quantity }] });
  invalid.push({ ...body(), items: [{ ...body().items[0], productId: 'bad' }] });
  invalid.push({ ...body(), shipping: { ...body().shipping, email: 'bad' } });
  for (const input of invalid) await assert.rejects(createOrder(userId, input, key), { status: 400 });
  for (const badKey of [undefined, '', 'short', 'x'.repeat(101), 'contains spaces'])
    await assert.rejects(createOrder(userId, body(), badKey), { status: 400 });
  assert.equal(lookup.mock.callCount(), 0);
});

test('order uses trusted prices, ownership, defaults and transactional stock/cart writes', async () => {
  const { session } = fixtures();
  const input = body();
  input.user = 'attacker'; input.total = 0; input.status = 'delivered'; input.paymentStatus = 'paid';
  input.items[0].price = 0;
  const result = await createOrder(userId, input, key);
  assert.equal(result.created, true);
  assert.equal(result.order.user, userId);
  assert.equal(result.order.subtotal, 40);
  assert.equal(result.order.discount, 8);
  assert.equal(result.order.total, 47);
  assert.equal(result.order.items[0].price, 20);
  assert.equal(result.order.paymentMethod, 'cash_on_delivery');
  assert.equal(result.order.status, 'pending');
  assert.equal(result.order.paymentStatus, 'unpaid');
  assert.deepEqual(Product.updateOne.mock.calls[0].arguments, [
    { _id: productId, active: true, stock: { $gte: 2 } },
    { $inc: { stock: -2, sales: 2 } }, { session },
  ]);
  assert.deepEqual(Cart.updateOne.mock.calls[0].arguments, [{ user: userId }, { items: [] }, { session }]);
  assert.equal(Order.create.mock.calls[0].arguments[1].session, session);
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('unavailable products, invalid variants and aggregate stock shortages reject creation', async () => {
  fixtures();
  const cases = [
    [{ ...body().items[0], productId: 'dddddddddddddddddddddddd' }],
    [{ ...body().items[0], size: 'XL' }],
    [{ ...body().items[0], color: 'Red' }],
    [{ ...body().items[0], quantity: 6 }, { ...body().items[0], quantity: 6 }],
  ];
  for (const items of cases) await assert.rejects(createOrder(userId, { ...body(), items }, key), (e) => [400, 409].includes(e.status));
  assert.equal(Order.create.mock.callCount(), 0);
  assert.equal(Product.updateOne.mock.callCount(), 0);
});

test('stock race aborts transaction and closes the session', async () => {
  const { session } = fixtures();
  Product.updateOne.mock.mockImplementation(async () => ({ modifiedCount: 0 }));
  await assert.rejects(createOrder(userId, body(), key), { status: 409 });
  assert.equal(Order.create.mock.callCount(), 0);
  assert.equal(Cart.updateOne.mock.callCount(), 0);
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('same request replays without writes, different request conflicts', async () => {
  fixtures();
  const initial = await createOrder(userId, body(), key);
  Order.findOne.mock.mockImplementation(async () => initial.order);
  const replay = await createOrder(userId, { ...body(), paymentMethod: 'cash_on_delivery' }, key);
  assert.equal(replay.created, false);
  assert.equal(Order.create.mock.callCount(), 1);
  await assert.rejects(createOrder(userId, { ...body(), promoCode: '' }, key), { status: 409 });
});

test('concurrent duplicate-key winner is returned as a replay', async () => {
  const { session } = fixtures();
  const order = { requestHash: createHash('sha256').update(JSON.stringify(validateOrder(body(), key))).digest('hex') };
  let lookups = 0;
  Order.findOne.mock.mockImplementation(async () => ++lookups === 1 ? null : order);
  Order.create.mock.mockImplementation(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  assert.deepEqual(await createOrder(userId, body(), key), { order, created: false });
  assert.equal(Cart.updateOne.mock.callCount(), 0);
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('database failures propagate without clearing the cart and close the session', async () => {
  const { session } = fixtures();
  Order.create.mock.mockImplementation(async () => { throw new Error('database failed'); });
  await assert.rejects(createOrder(userId, body(), key), /database failed/);
  assert.equal(Cart.updateOne.mock.callCount(), 0);
  assert.equal(session.endSession.mock.callCount(), 1);
});

test('HTTP order route enforces JWT and returns JSON 400, 201, 200 and 409', async (t) => {
  fixtures();
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters';
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  mock.method(User, 'findById', async () => ({ _id: userId }));
  const app = express();
  app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/orders`;
  const token = jwt.sign({}, process.env.JWT_SECRET, { subject: userId, issuer: 'shopco-api', audience: 'shopco' });
  const send = (input, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) });
  const unauthenticated = await send(body());
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).success, false);
  const headers = { authorization: `Bearer ${token}`, 'idempotency-key': key };
  assert.equal((await send({}, headers)).status, 400);
  const created = await send(body(), headers);
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.success, true);
  Order.findOne.mock.mockImplementation(async () => payload.data);
  assert.equal((await send(body(), headers)).status, 200);
  assert.equal((await send({ ...body(), promoCode: '' }, headers)).status, 409);
});
