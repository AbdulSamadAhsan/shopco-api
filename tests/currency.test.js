const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { StoreSettings } = require('../models/StoreSettings');
const { getCurrency, convertQuote } = require('../services/currencyService');
const currency = require('../services/currencyService');
const { Product } = require('../models/Product');
const { GuestCart } = require('../models/GuestCart');
afterEach(() => mock.restoreAll());
test('store currency defaults only when absent and reads the admin-managed exchange rate', async () => {
  let stored = null;
  mock.method(StoreSettings, 'findOne', filter => {
    assert.deepEqual(filter, { key: 'store' }); return { lean: async () => stored };
  });
  assert.equal((await getCurrency()).currency, 'USD');
  stored = { currency: 'PKR', exchangeRate: 280 };
  assert.deepEqual(await getCurrency(), { currency: 'PKR', exchangeRate: 280, baseCurrency: 'USD' });
  stored.exchangeRate = 0;
  await assert.rejects(getCurrency(), { status: 503 });
});
test('converted unit prices, fixed discounts, tax and delivery add up in cents', () => {
  const base = { items: [{ price: 0.01, quantity: 3 }], subtotal: 0.03, discount: 0.01, gst: 0, gstRate: 0.16, deliveryFee: 15, total: 15.02, currency: 'USD' };
  const result = convertQuote(base, { currency: 'EUR', exchangeRate: 1.5, baseCurrency: 'USD' });
  assert.equal(result.items[0].price, 0.02);
  assert.equal(result.subtotal, 0.06);
  assert.equal(result.discount, 0.02);
  assert.equal(result.gst, 0.01);
  assert.equal(result.deliveryFee, 22.5);
  assert.equal(result.total, 22.55);
  assert.equal(base.items[0].price, 0.01);
});

test('cart responses use the same converted currency for unit prices and checkout totals', async () => {
  const id = 'a'.repeat(24);
  mock.method(currency, 'getCurrency', async () => ({ currency: 'PKR', exchangeRate: 280, baseCurrency: 'USD' }));
  mock.method(GuestCart, 'findOneAndUpdate', async () => ({ items: [{ productId: id, quantity: 2, size: 'M', color: 'Black' }], revision: 4 }));
  mock.method(Product, 'find', () => {
    const query = { session() { return this; }, lean: async () => [{ _id: id, name: 'Coat', active: true, price: 80, stock: 10, sizes: ['M'], colors: ['Black'] }] };
    return query;
  });
  const result = await require('../services/cartService').getGuestCart('guest');
  assert.equal(result.items[0].price, 22400);
  assert.equal(result.totals.items[0].price, 22400);
  assert.equal(result.currency, 'PKR');
  assert.equal(result.totals.currency, 'PKR');
  assert.equal(result.totals.subtotal, 44800);
  assert.equal(result.totals.gst, 7168);
  assert.equal(result.totals.total, 56168);
});
