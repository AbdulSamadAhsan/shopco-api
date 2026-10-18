// Run once against an existing database before enabling variant reviews and coupons:
// node --env-file=.env scripts/migrate-reviews-coupons.cjs
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
(async () => {
  await connectDB();
  try {
    const reviews = mongoose.connection.collection('reviews');
    await reviews.createIndex({ product: 1, user: 1, order: 1, size: 1, color: 1 }, { unique: true, partialFilterExpression: { order: { $exists: true } } });
    const old = (await reviews.indexes()).find(index => index.unique && Object.keys(index.key).length === 2 && index.key.product === 1 && index.key.user === 1);
    if (old) await reviews.dropIndex(old.name);
    const reviewed = await reviews.distinct('product');
    await mongoose.connection.collection('products').updateMany({ _id: { $nin: reviewed }, $or: [{ rating: 0 }, { rating: null }, { rating: { $exists: false } }] }, { $set: { rating: 5 } });
    const coupons = mongoose.connection.collection('coupons');
    await coupons.createIndex({ code: 1 }, { unique: true });
    await coupons.updateOne({ code: 'WELCOME20' }, { $setOnInsert: { code: 'WELCOME20', type: 'percentage', value: 20, minSubtotal: 0, active: true, expiresAt: null, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
    console.log('Review indexes, default ratings and WELCOME20 coupon are ready.');
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
