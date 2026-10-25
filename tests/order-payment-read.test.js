const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Order } = require('../models/Order');
const { listOrders, getOrder } = require('../services/orderService');
afterEach(() => mock.restoreAll());
test('customer list and detail persist and return settled COD using owner-scoped writes', async () => {
  const owner = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  let stored = { _id: 'cccccccccccccccccccccccc', user: owner, paymentMethod: 'cash_on_delivery', status: 'delivered', paymentStatus: 'unpaid', total: 284.12 };
  mock.method(Order, 'find', () => ({ sort() { return this; }, limit() { return this; }, lean: async () => [{ ...stored }] }));
  mock.method(Order, 'findOne', filter => { assert.equal(filter.user, owner); return { lean: async () => ({ ...stored }) }; });
  const write = mock.method(Order, 'findOneAndUpdate', filter => {
    assert.equal(filter.user, owner);
    assert.equal(filter._id, stored._id);
    stored = { ...stored, paymentStatus: 'paid' };
    return { lean: async () => ({ ...stored }) };
  });
  const [order] = await listOrders(owner);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.total, 284.12);
  assert.equal((await getOrder(owner, stored._id)).paymentStatus, 'paid');
  assert.equal(write.mock.callCount(), 1);
});
