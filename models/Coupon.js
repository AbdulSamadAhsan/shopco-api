const { Schema, options, model } = require('./schema');
const Coupon = model('Coupon', new Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  minSubtotal: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, { ...options, collection: 'coupons' }));
module.exports = { Coupon };
