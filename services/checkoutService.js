const { Product } = require('../models/Product.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function quote(items, promoCode, session) {
  if (!Array.isArray(items) || items.length > 100) fail(400, 'Cart must contain at most 100 items');
  for (const item of items) {
    if (!item || typeof item.productId !== 'string' || !/^[a-f\d]{24}$/i.test(item.productId) ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000 ||
        typeof item.size !== 'string' || !item.size.trim() ||
        typeof item.color !== 'string' || !item.color.trim())
      fail(400, 'Each cart item needs a valid product, size, color and positive whole-number quantity');
  }
  if (promoCode !== undefined && (typeof promoCode !== 'string' || promoCode.length > 100)) fail(400, 'Invalid promo code');
  const rows = await Product.find({ _id: { $in: items.map((i) => i.productId) }, active: true })
    .session(session || null)
    .lean();
  const byId = new Map(rows.map((p) => [String(p._id), p]));
  const totals = new Map();
  const lines = items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) fail(400, 'Product is unavailable');
    if (!p.sizes.includes(i.size) || !p.colors.includes(i.color)) fail(400, 'Invalid product size or color');
    totals.set(i.productId, (totals.get(i.productId) || 0) + i.quantity);
    if (totals.get(i.productId) > p.stock) fail(409, 'Insufficient stock for ' + p.name);
    return { ...i, name: p.name, image: p.image, price: p.price };
  });
  const cents = lines.reduce((sum, i) => sum + Math.round(i.price * 100) * i.quantity, 0);
  const discount = promoCode === 'WELCOME20' ? Math.round(cents * 0.2) : 0;
  const gst = Math.round((cents - discount) * 0.16);
  const delivery = lines.length ? 1500 : 0;
  return {
    items: lines,
    subtotal: cents / 100,
    discount: discount / 100,
    gst: gst / 100,
    gstRate: 0.16,
    deliveryFee: delivery / 100,
    total: (cents - discount + gst + delivery) / 100,
    currency: 'USD',
  };
}

module.exports = { quote };
