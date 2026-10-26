const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Product } = require('../models/Product');
const { GuestCart } = require('../models/GuestCart');
const currency = require('../services/currencyService');
const { getGuestCart, putGuestCart } = require('../services/cartService');
afterEach(() => mock.restoreAll());

test('changing a cart size persists the selection and recalculates its trusted price and total', async () => {
  const id = 'a'.repeat(24);
  const product = { _id: id, name: 'Shirt', active: true, price: 10, stock: 10, sizes: ['Small', 'Large'], colors: ['Black'], sizePrices: [{ size: 'Large', price: 20 }] };
  let cart = { items: [{ productId: id, quantity: 1, size: 'Small', color: 'Black' }], revision: 1 };
  mock.method(currency, 'getCurrency', async () => ({ currency: 'USD', exchangeRate: 1, baseCurrency: 'USD' }));
  mock.method(Product, 'find', () => ({ session() { return this; }, lean: async () => [product] }));
  mock.method(GuestCart, 'findOneAndUpdate', async (filter, update) => {
    if (update.$set) {
      if (filter.revision !== cart.revision) return null;
      cart = { ...cart, ...update.$set, revision: cart.revision + 1 };
    }
    return cart;
  });
  const before = await getGuestCart('owner');
  assert.deepEqual(before.items[0].availableSizes, ['Small', 'Large']);
  assert.equal(before.items[0].price, 10);
  const changed = await putGuestCart('owner', { revision: 1, items: [{ ...cart.items[0], size: 'Large', price: 0 }] });
  assert.equal(changed.items[0].size, 'Large');
  assert.equal(changed.items[0].price, 20);
  assert.equal(changed.totals.subtotal, 20);
  assert.equal(changed.totals.gst, 3.2);
  assert.equal(changed.totals.total, 38.2);
  assert.equal(changed.revision, 2);
  assert.equal((await getGuestCart('owner')).items[0].size, 'Large');
  await assert.rejects(putGuestCart('owner', { revision: 2, items: [{ ...cart.items[0], size: 'Unknown' }] }), { status: 400 });
  assert.equal(cart.items[0].size, 'Large');
});
