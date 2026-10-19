const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OrderEmail } = require('../models/OrderEmail');
const { Order } = require('../models/Order');
const smtp = require('../services/smtpService');
const { orderEmail } = require('../services/orderEmailTemplate');
const emails = require('../services/orderEmailService');
afterEach(() => mock.restoreAll());
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const order = { _id: id, status: 'pending', paymentMethod: 'cash_on_delivery', currency: 'USD', shipping: { firstName: '<Ada>', lastName: 'Lovelace', email: 'buyer@example.com', address: '1 Main St', phone: '123456789' }, items: [{ name: '<Blue Coat>', quantity: 2, price: 50, size: 'Large', color: '#0000ff' }], subtotal: 100, discount: 20, gst: 12.8, deliveryFee: 15, total: 107.8 };
function setup(value = order) {
  mock.method(smtp, 'configuration', () => ({}));
  const claim = mock.method(OrderEmail, 'findOneAndUpdate', async () => ({ _id: 'job', attempts: 1 }));
  mock.method(Order, 'findById', () => ({ lean: async () => value }));
  const write = mock.method(OrderEmail, 'updateOne', async () => ({}));
  const send = mock.method(smtp, 'send', async () => ({}));
  return { claim, write, send };
}
test('confirmation contains purchased variants, quantities, address and saved totals with escaped HTML', () => {
  const message = orderEmail(order);
  assert.equal(message.to, 'buyer@example.com');
  for (const text of ['Large', '#0000ff', 'Qty: 2', '$107.80', '$12.80', '1 Main St', 'Cash on delivery']) assert.ok(message.text.includes(text));
  assert.ok(message.html.includes('&lt;Blue Coat&gt;'));
  assert.ok(!message.html.includes('<Blue Coat>'));
  assert.match(orderEmail({ ...order, paymentMethod: 'stripe' }).text, /Paid by card/);
});
test('email jobs are enqueued in the same order transaction without resending an existing job', async () => {
  const write = mock.method(OrderEmail, 'updateOne', async () => ({}));
  const session = {};
  await emails.enqueue(id, session);
  assert.deepEqual(write.mock.calls[0].arguments[0], { order: id });
  assert.equal(write.mock.calls[0].arguments[2].session, session);
  assert.equal(write.mock.calls[0].arguments[2].upsert, true);
  assert.ok(write.mock.calls[0].arguments[1].$setOnInsert);
});
test('SMTP acceptance marks a claimed job sent and skips duplicate claims', async () => {
  const { claim, write, send } = setup();
  assert.equal((await emails.deliver(id)).status, 'sent');
  assert.equal(send.mock.callCount(), 1);
  assert.equal(send.mock.calls[0].arguments[0].orderId, id);
  assert.equal(write.mock.calls[0].arguments[1].$set.status, 'sent');
  claim.mock.mockImplementation(async () => null);
  await emails.deliver(id);
  assert.equal(send.mock.callCount(), 1);
});
test('SMTP failures are recorded for retry and never escape into the order response', async () => {
  const { write, send } = setup();
  send.mock.mockImplementation(async () => { throw Object.assign(new Error('Private SMTP details'), { code: 'ECONNECTION' }); });
  assert.equal((await emails.deliver(id)).status, 'failed');
  const status = write.mock.calls[0].arguments[1].$set;
  assert.equal(status.status, 'failed');
  assert.equal(status.lastErrorCode, 'ECONNECTION');
  assert.ok(status.nextAttemptAt > new Date());
  assert.equal(JSON.stringify(status).includes('Private SMTP'), false);
});
test('unpaid card and cancelled orders never send confirmations', async () => {
  const { send } = setup({ ...order, paymentMethod: 'stripe', paymentStatus: 'unpaid' });
  assert.equal((await emails.deliver(id)).status, 'skipped');
  assert.equal(send.mock.callCount(), 0);
  Order.findById.mock.mockImplementation(() => ({ lean: async () => ({ ...order, status: 'cancelled' }) }));
  assert.equal((await emails.deliver(id)).status, 'skipped');
});
test('missing SMTP configuration preserves queued jobs for later delivery', async () => {
  const { claim, send } = setup();
  smtp.configuration.mock.mockImplementation(() => null);
  assert.equal((await emails.deliver(id)).status, 'not_configured');
  assert.equal(claim.mock.callCount(), 0); assert.equal(send.mock.callCount(), 0);
});
