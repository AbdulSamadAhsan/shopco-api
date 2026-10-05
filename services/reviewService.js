const mongoose = require('mongoose');
const { Product } = require('../models/Product.js');
const { Review } = require('../models/Review.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function listReviews(productId) {
  return await Review.find({ product: productId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('-user')
    .lean();
}

async function createReview(userId, userName, productId, data) {
  const product = productId;
  const input = { rating: Number(data?.rating), comment: String(data?.comment || '') };
  let review;
  await mongoose.connection.transaction(async (session) => {
    if (!(await Product.exists({ _id: product, active: true }).session(session)))
      fail(404, 'Product not found');
    [review] = await Review.create([{ ...input, product, user: userId, name: userName }], { session });
    const stats = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(product) } },
      { $group: { _id: null, rating: { $avg: '$rating' } } },
    ]).session(session);
    await Product.updateOne({ _id: product }, { rating: Math.round(stats[0].rating * 10) / 10 }, { session });
  });
  return { _id: review._id, name: review.name, rating: review.rating, comment: review.comment };
}

module.exports = { listReviews, createReview };
