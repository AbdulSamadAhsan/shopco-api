const mongoose = require('mongoose');
const { Product } = require('../models/Product.js');
const { Review } = require('../models/Review.js');
const { Order } = require('../models/Order.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function listReviews(productId) {
  if (!mongoose.isObjectIdOrHexString(productId)) fail(404, 'Product not found');
  return await Review.find({ product: productId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('-user -order')
    .lean();
}

async function createReview(userId, userName, productId, data) {
  if (!mongoose.isObjectIdOrHexString(productId)) fail(404, 'Product not found');
  const product = productId;
  const input = { rating: Number(data?.rating), comment: String(data?.comment || '').trim() };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) fail(400, 'Choose a rating from 1 to 5');
  if (input.comment.length > 2000) fail(400, 'Keep your review under 2000 characters');
  if (!mongoose.isObjectIdOrHexString(data?.orderId)) fail(400, 'Select the order you want to rate');
  if (typeof data.size !== 'string' || typeof data.color !== 'string' || data.size.length > 100 || data.color.length > 100) fail(400, 'Select the purchased size and color');
  const identity = { product, user: userId, order: data.orderId, size: data.size, color: data.color };
  let review;
  await mongoose.connection.transaction(async (session) => {
    if (!(await Product.exists({ _id: product, active: true }).session(session)))
      fail(404, 'Product not found');
    if (!(await Order.exists({ _id: identity.order, user: userId, status: 'delivered', items: { $elemMatch: { productId: product, size: identity.size, color: identity.color } } }).session(session)))
      fail(403, 'You can only rate the size and color purchased in your own delivered order');
    review = await Review.findOneAndUpdate(identity, { $set: { ...input, name: userName } }, { session, upsert: true, returnDocument: 'after', runValidators: true });
    const stats = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(product) } },
      { $group: { _id: null, rating: { $avg: '$rating' } } },
    ]).session(session);
    await Product.updateOne({ _id: product }, { rating: Math.round(stats[0].rating * 10) / 10 }, { session });
  });
  return { _id: review._id, name: review.name, rating: review.rating, comment: review.comment, product, order: identity.order, size: identity.size, color: identity.color };
}

const myReviews = userId => Review.find({ user: userId }).select('product order size color rating comment').lean();
module.exports = { listReviews, createReview, myReviews };
