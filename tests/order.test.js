const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Product } = require('../models/Product');
const { Coupon } = require('../models/Coupon');
const emails = require('../services/orderEmailService');
const currency = require('../services/currencyService');
const { Order } = require('../models/Order');
const { Cart } = require('../models/Cart');
const { User } = require('../models/User');
const { validateOrder } = require('../services/orderValidation');
const { createOrder, listOrders, getOrder } = require('../services/orderService');
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
  mock.method(currency, 'getCurrency', async () => ({ currency: 'USD', exchangeRate: 1, baseCurrency: 'USD' }));
  mock.method(emails, 'enqueue', async () => {});
  mock.method(emails, 'deliver', async () => ({ status: 'not_configured' }));
  mock.method(Coupon, 'findOne', () => ({ session: () => ({ lean: async () => ({ code: 'WELCOME20', active: true, type: 'percentage', value: 20, minSubtotal: 0 }) }) }));
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

test('new orders snapshot converted prices and keep retry amounts after the currency changes', async () => {
  fixtures();
  currency.getCurrency.mock.mockImplementation(async () => ({ currency: 'PKR', exchangeRate: 280, baseCurrency: 'USD' }));
  const input = { ...body(), currency: 'PKR', exchangeRate: 280 };
  const placed = await createOrder(userId, input, key);
  assert.equal(placed.order.items[0].price, 5600);
  assert.equal(placed.order.subtotal, 11200);
  assert.equal(placed.order.discount, 2240);
  assert.equal(placed.order.gst, 1433.6);
  assert.equal(placed.order.deliveryFee, 4200);
  assert.equal(placed.order.total, 14593.6);
  assert.equal(placed.order.currency, 'PKR');
  Order.findOne.mock.mockImplementation(async () => placed.order);
  currency.getCurrency.mock.mockImplementation(async () => ({ currency: 'USD', exchangeRate: 1 }));
  assert.equal((await createOrder(userId, input, key)).order.total, 14593.6);
  assert.equal(Order.create.mock.callCount(), 1);
});

test('a stale or omitted exchange rate cannot place an order at an unreviewed total', async () => {
  fixtures();
  currency.getCurrency.mock.mockImplementation(async () => ({ currency: 'PKR', exchangeRate: 280, baseCurrency: 'USD' }));
  for (const input of [body(), { ...body(), currency: 'USD', exchangeRate: 1 }, { ...body(), currency: 'PKR', exchangeRate: 279 }]) {
    await assert.rejects(createOrder(userId, input, key), { status: 409 });
  }
  assert.equal(Product.updateOne.mock.callCount(), 0);
  assert.equal(Order.create.mock.callCount(), 0);
});

test('order history pagination always stays scoped to the signed-in account', async () => {
  let filter, sort, limit;
  mock.method(Order, 'find', value => {
    filter=value;
    return {sort(value){sort=value;return this;},limit(value){limit=value;return this;},lean:async()=>[]};
  });
  await listOrders(userId);
  assert.deepEqual(filter,{user:userId});
  assert.deepEqual(sort,{_id:-1});assert.equal(limit,100);
  await listOrders(userId,'cccccccccccccccccccccccc');
  assert.deepEqual(filter,{user:userId,_id:{$lt:'cccccccccccccccccccccccc'}});
  await assert.rejects(listOrders(userId,'invalid'),{status:400});
});

test('another account cannot retrieve an order by guessing its ID', async () => {
  let filter;
  mock.method(Order,'findOne',value=>{filter=value;return {lean:async()=>null};});
  await assert.rejects(getOrder(userId,'cccccccccccccccccccccccc'),{status:404});
  assert.deepEqual(filter,{_id:'cccccccccccccccccccccccc',user:userId});
});

test('both payment methods accept shipping without city and country', async () => {
  fixtures();
  const input = body();
  delete input.shipping.city;
  delete input.shipping.country;
  for (const method of ['cash_on_delivery', 'stripe']) {
    const result = await createOrder(userId, { ...input, paymentMethod: method }, key, method);
    assert.equal(result.order.paymentMethod, method);
    assert.equal(result.order.shipping.city, undefined);
    assert.equal(result.order.shipping.country, undefined);
    assert.equal(result.order.gst, 5.12);
    assert.equal(result.order.total, 52.12);
  }
  assert.throws(() => validateOrder({ ...input, shipping: { ...input.shipping, address: '' } }, key), { status: 400 });
});

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
  assert.equal(result.order.gst, 5.12);
  assert.equal(result.order.total, 52.12);
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

test('HTTP order route requires a valid checkout owner and returns JSON 400, 201, 200 and 409', async (t) => {
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
  assert.equal(unauthenticated.status, 400);
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

test('guest order route uses cart ownership, preserves retry safety and keeps history private', async t => {
  fixtures();
  const app = express();
  app.use(express.json()); app.use('/api', routes); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/orders`;
  const headers = { 'content-type': 'application/json', 'x-cart-token': 'a'.repeat(64), 'idempotency-key': key };
  const send = (input, extra = {}) => fetch(url, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(input) });
  assert.equal((await send(body(), { 'x-cart-token': 'invalid' })).status, 400);
  const created = await send({ ...body(), user: userId, guestTokenHash: 'spoofed' });
  assert.equal(created.status, 201);
  const { data: order } = await created.json();
  assert.equal(order.user, null);
  assert.equal(order.guestTokenHash, createHash('sha256').update('a'.repeat(64)).digest('hex'));
  assert.equal(order.total, 52.12);
  assert.equal(Cart.updateOne.mock.callCount(), 0);
  Order.findOne.mock.mockImplementation(async filter => filter.idempotencyKey === order.idempotencyKey ? order : null);
  assert.equal((await send(body())).status, 200);
  assert.equal((await send({ ...body(), promoCode: '' })).status, 409);
  const another = await send(body(), { 'x-cart-token': 'b'.repeat(64) });
  assert.equal(another.status, 201);
  assert.notEqual((await another.json()).data.idempotencyKey, order.idempotencyKey);
  assert.equal(Order.create.mock.callCount(), 2);
  process.env.JWT_SECRET ||= 'test-secret-that-is-at-least-32-characters';
  assert.equal((await fetch(url, { headers })).status, 401);
  assert.equal((await fetch(url + '/' + order._id, { headers })).status, 401);
});

test('orders no longer require city or country', async () => {
 const input=body(); delete input.shipping.city; delete input.shipping.country;
 const validated=validateOrder(input,key);
 assert.equal(validated.shipping.city,undefined); assert.equal(validated.shipping.country,undefined);
});
test('GST rounds once in cents after discount; empty carts have zero totals',async()=>{
 const {product}=fixtures(); const {quote}=require('../services/checkoutService');
 product.price=19.99;
 const priced=await quote([{productId,quantity:1,size:'M',color:'Black'}],'WELCOME20');
 assert.equal(priced.discount,4); assert.equal(priced.gst,2.56); assert.equal(priced.total,33.55);
 const empty=await quote([]);assert.equal(empty.gst,0);assert.equal(empty.total,0);
});
