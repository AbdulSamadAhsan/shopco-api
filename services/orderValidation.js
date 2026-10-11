const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function text(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(`${field} is required and must be at most ${max} characters`);
  return value.trim();
}

function validateOrder(data, key) {
  if (typeof key !== 'string' || !/^[\x21-\x7e]{8,100}$/.test(key))
    fail('Idempotency-Key must contain 8–100 non-whitespace ASCII characters');
  if (!object(data)) fail('Order body must be an object');
  if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100)
    fail('Order must contain 1–100 items');
  const items = data.items.map((item) => {
    if (!object(item) || typeof item.productId !== 'string' || !/^[a-f\d]{24}$/i.test(item.productId))
      fail('Each item requires a valid productId');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000)
      fail('Item quantity must be an integer between 1 and 10000');
    return {
      productId: item.productId.toLowerCase(),
      quantity: item.quantity,
      size: text(item.size, 'Item size', 100),
      color: text(item.color, 'Item color', 100),
    };
  });
  if (!object(data.shipping)) fail('Shipping details are required');
  const shipping = {};
  for (const field of ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country'])
    shipping[field] = text(data.shipping[field], `Shipping ${field}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) fail('Shipping email is invalid');
  if (data.paymentMethod !== undefined && data.paymentMethod !== 'cash_on_delivery')
    fail('Only cash_on_delivery is supported');
  if (data.promoCode !== undefined && (typeof data.promoCode !== 'string' || data.promoCode.length > 100))
    fail('Promo code must be a string of at most 100 characters');
  return { items, shipping, promoCode: data.promoCode || '', paymentMethod: 'cash_on_delivery' };
}

module.exports = { validateOrder };
