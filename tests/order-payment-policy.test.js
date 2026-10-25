const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Order } = require('../models/Order');
const { reconcileCompletedPayment } = require('../services/orderPaymentPolicy');
afterEach(() => mock.restoreAll());

for (const status of ['delivered', 'completed']) {
  for (const paymentStatus of ['unpaid', 'pending', '', null, undefined]) {
    test(`persists historical COD ${status}/${paymentStatus} once`, async () => {
      const old = { _id: 'order', status, paymentStatus, paymentMethod: 'cash_on_delivery', total: 284.12 };
      const paid = { ...old, paymentStatus: 'paid' };
      const write = mock.method(Order, 'findOneAndUpdate', (filter, update, options) => {
        assert.deepEqual(filter, { user: 'owner', _id: 'order', paymentMethod: 'cash_on_delivery', status: { $in: ['delivered', 'completed'] }, paymentStatus: { $in: ['unpaid', 'pending', '', null] } });
        assert.deepEqual(update, { $set: { paymentStatus: 'paid' } });
        assert.equal(options.timestamps, false);
        assert.equal(options.session, 'transaction');
        return { lean: async () => paid };
      });
      assert.deepEqual(await reconcileCompletedPayment(old, { user: 'owner' }, 'transaction'), paid);
      assert.deepEqual(await reconcileCompletedPayment(paid), paid);
      assert.equal(write.mock.callCount(), 1);
    });
  }
}
test('never marks card, unknown-method, refunded, failed or unfinished orders paid', async () => {
  const write = mock.method(Order, 'findOneAndUpdate', () => { throw new Error('Unexpected write'); });
  for (const paymentMethod of ['stripe', 'card', undefined, 'cash_on_delivery']) {
    for (const status of ['pending', 'shipped', 'cancelled', 'delivered', 'completed']) {
      for (const paymentStatus of ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'expired']) {
        if (paymentMethod === 'cash_on_delivery' && ['delivered','completed'].includes(status) && ['unpaid','pending'].includes(paymentStatus)) continue;
        const order = { _id: 'order', paymentMethod, status, paymentStatus };
        assert.equal(await reconcileCompletedPayment(order), order);
      }
    }
  }
  assert.equal(await reconcileCompletedPayment(null), null);
  assert.equal(write.mock.callCount(), 0);
});
test('concurrent refund wins and is returned from an owner-scoped read', async () => {
  mock.method(Order, 'findOneAndUpdate', () => ({ lean: async () => null }));
  const refunded = { _id: 'order', status: 'delivered', paymentMethod: 'cash_on_delivery', paymentStatus: 'refunded' };
  mock.method(Order, 'findOne', filter => {
    assert.deepEqual(filter, { user: 'owner', _id: 'order' });
    return { session(s) { assert.equal(s, 'transaction'); return this; }, lean: async () => refunded };
  });
  assert.equal(await reconcileCompletedPayment({ ...refunded, paymentStatus: 'unpaid' }, { user: 'owner' }, 'transaction'), refunded);
});
test('write failures propagate instead of inventing a paid response', async () => {
  mock.method(Order, 'findOneAndUpdate', () => ({ lean: async () => { throw new Error('database unavailable'); } }));
  await assert.rejects(reconcileCompletedPayment({ _id: 'order', paymentMethod: 'cash_on_delivery', status: 'delivered', paymentStatus: 'unpaid' }), /database unavailable/);
});
