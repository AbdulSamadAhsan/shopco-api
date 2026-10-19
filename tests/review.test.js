const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { Product } = require('../models/Product');
const { Order } = require('../models/Order');
const { Review } = require('../models/Review');
const { createReview } = require('../services/reviewService');
afterEach(() => mock.restoreAll());
const user = 'aaaaaaaaaaaaaaaaaaaaaaaa', product = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const variant = { orderId: 'cccccccccccccccccccccccc', size: 'Medium', color: '#00c12b' };
function setup(purchased = true) {
  mock.method(mongoose.connection, 'transaction', callback => callback({}));
  mock.method(Product, 'exists', () => ({ session: async () => true }));
  const purchase = mock.method(Order, 'exists', () => ({ session: async () => purchased }));
  const write = mock.method(Review, 'findOneAndUpdate', async (filter, update, options) => ({ _id: 'review', ...update.$set }));
  mock.method(Review, 'aggregate', () => ({ session: async () => [{ rating: 3.6666 }] }));
  const average = mock.method(Product, 'updateOne', async () => ({}));
  return { purchase, write, average };
}
test('new products default to five stars', () => {
  assert.equal(new Product({}).rating, 5);
});
test('invalid ratings and long comments never write reviews', async () => {
  const { write } = setup();
  for (const rating of [0, 6, 2.5, 'invalid', null]) await assert.rejects(createReview(user, 'Ada', product, { rating }), { status: 400 });
  await assert.rejects(createReview(user, 'Ada', product, { rating: 5, comment: 'x'.repeat(2001) }), { status: 400 });
  await assert.rejects(createReview(user, 'Ada', 'bad-id', { rating: 5 }), { status: 404 });
  assert.equal(write.mock.callCount(), 0);
});
test('customers cannot rate products without their own delivered order', async () => {
  const { purchase, write } = setup(false);
  await assert.rejects(createReview(user, 'Ada', product, { ...variant, rating: 4 }), { status: 403 });
  assert.deepEqual(purchase.mock.calls[0].arguments[0], { _id: variant.orderId, user, status: 'delivered', items: { $elemMatch: { productId: product, size: variant.size, color: variant.color } } });
  assert.equal(write.mock.callCount(), 0);
});
test('rating saves or updates one review per customer and recalculates the average', async () => {
  const { write, average } = setup();
  const result = await createReview(user, 'Ada', product, { ...variant, rating: 4, comment: ' Great ' });
  assert.equal(result.rating, 4);
  assert.deepEqual(write.mock.calls[0].arguments[0], { product, user, order: variant.orderId, size: variant.size, color: variant.color });
  assert.equal(write.mock.calls[0].arguments[1].$set.comment, 'Great');
  assert.equal(write.mock.calls[0].arguments[2].upsert, true);
  assert.equal(average.mock.calls[0].arguments[1].rating, 3.7);
});
test('different orders and purchased variants have separate review identities', async () => {
  const { write } = setup();
  for (const identity of [variant, { ...variant, orderId: 'dddddddddddddddddddddddd' }, { ...variant, size: 'Large' }, { ...variant, color: '#000000' }]) {
    await createReview(user, 'Ada', product, { ...identity, rating: 3 });
  }
  const keys = write.mock.calls.map(call => JSON.stringify(call.arguments[0]));
  assert.equal(new Set(keys).size, 4);
  await createReview(user, 'Ada', product, { ...variant, rating: 5 });
  assert.deepEqual(write.mock.calls[4].arguments[0], write.mock.calls[0].arguments[0]);
});
test('missing order or variant is rejected before review writes', async () => {
  const { write } = setup();
  for (const data of [{ rating: 5 }, { ...variant, orderId: 'bad', rating: 5 }, { ...variant, size: null, rating: 5 }]) {
    await assert.rejects(createReview(user, 'Ada', product, data), { status: 400 });
  }
  assert.equal(write.mock.callCount(), 0);
});
