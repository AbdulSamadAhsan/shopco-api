const { Coupon } = require('../models/Coupon');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
async function couponDiscount(promoCode, subtotalCents, session) {
  if (promoCode === undefined || promoCode === null || promoCode === '') return 0;
  if (typeof promoCode !== 'string') fail('Invalid coupon code');
  const code = promoCode.trim().toUpperCase();
  if (!code) return 0;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) fail('Invalid coupon code');
  const coupon = await Coupon.findOne({ code }).session(session || null).lean();
  if (!coupon || !coupon.active) fail('This coupon is invalid or inactive');
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) fail('This coupon has expired');
  if (subtotalCents < Math.round((coupon.minSubtotal || 0) * 100)) fail(`This coupon requires a minimum merchandise subtotal of $${Number(coupon.minSubtotal).toFixed(2)}`);
  if (!Number.isFinite(coupon.value) || coupon.value <= 0 || !['percentage', 'fixed'].includes(coupon.type) || (coupon.type === 'percentage' && coupon.value > 100)) fail('This coupon is unavailable');
  return Math.min(subtotalCents, coupon.type === 'percentage' ? Math.round(subtotalCents * coupon.value / 100) : Math.round(coupon.value * 100));
}
module.exports = { couponDiscount };
