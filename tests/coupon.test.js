const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Coupon } = require('../models/Coupon');
const { Product } = require('../models/Product');
const { couponDiscount } = require('../services/couponService');
const { quote } = require('../services/checkoutService');
afterEach(() => mock.restoreAll());
const valid = { active: true, type: 'percentage', value: 20, minSubtotal: 0 };
const fixture = coupon => mock.method(Coupon, 'findOne', () => ({ session() { return this; }, lean: async () => coupon }));
test('percentage and fixed coupons round cents and never exceed merchandise subtotal', async () => {
  const query = fixture(valid);
  assert.equal(await couponDiscount(' welcome20 ', 12345), 2469);
  assert.deepEqual(query.mock.calls[0].arguments[0], { code: 'WELCOME20' });
  query.mock.mockImplementation(() => ({ session() { return this; }, lean: async () => ({ ...valid, type: 'fixed', value: 200 }) }));
  assert.equal(await couponDiscount('BIG', 10000), 10000);
});
test('invalid, disabled, expired and below-minimum coupons cannot discount checkout', async () => {
  for (const coupon of [null, { ...valid, active: false }, { ...valid, expiresAt: new Date(0) }, { ...valid, minSubtotal: 100 }]) {
    const query = fixture(coupon);
    await assert.rejects(couponDiscount('SAVE', 5000), { status: 400 });
    query.mock.restore();
  }
  await assert.rejects(couponDiscount({ code: 'SAVE' }, 5000), { status: 400 });
  assert.equal(await couponDiscount('', 5000), 0);
});
test('checkout uses database coupon before GST and preserves delivery fee', async () => {
  fixture({ ...valid, type: 'fixed', value: 10 });
  mock.method(Product, 'find', () => ({ session() { return this; }, lean: async () => [{ _id: 'p1', name: 'Shirt', price: 50, stock: 10, sizes: ['M'], colors: ['Blue'] }] }));
  const totals = await quote([{ productId: 'p1', size: 'M', color: 'Blue', quantity: 2 }], 'SAVE10');
  assert.equal(totals.subtotal, 100); assert.equal(totals.discount, 10); assert.equal(totals.gst, 14.4); assert.equal(totals.deliveryFee, 15); assert.equal(totals.total, 119.4);
});
