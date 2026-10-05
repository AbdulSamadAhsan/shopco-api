const { Product } = require('../models/Product.js');
const { Cart } = require('../models/Cart.js');
const { GuestCart } = require('../models/GuestCart.js');
const { quote } = require('./checkoutService.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function guestView(cart) {
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }).lean();
  const items = cart.items.map((i) => {
    const p = products.find((p) => String(p._id) === String(i.productId));
    return {
      productId: String(i.productId),
      quantity: i.quantity,
      size: i.size,
      color: i.color,
      name: p?.name || 'Unavailable product',
      image: p?.image,
      price: p?.price || 0,
      stock: p?.stock || 0,
      available: !!(
        p?.active &&
        p.sizes.includes(i.size) &&
        p.colors.includes(i.color) &&
        p.stock >= i.quantity
      ),
    };
  });
  let totals = null,
    message = '';
  try {
    totals = await quote(
      items.map(({ productId, quantity, size, color }) => ({ productId, quantity, size, color })),
      cart.promoCode,
    );
  } catch (e) {
    if (![400, 409].includes(e.status)) throw e;
    message = e.message;
  }
  return { items, totals, message, revision: cart.revision, promoCode: cart.promoCode || '' };
}

async function getUserCart(userId) {
  const cart = await Cart.findOne({ user: userId }).lean();
  return { items: cart?.items || [] };
}

async function putUserCart(userId, data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const priced = await quote(items);
  await Cart.findOneAndUpdate({ user: userId }, { items }, { upsert: true });
  return priced;
}

async function deleteUserCart(userId) {
  await Cart.updateOne({ user: userId }, { items: [] });
  return { items: [] };
}

async function getGuestCart(owner) {
  let cart;
  try {
    cart = await GuestCart.findOneAndUpdate(
      { owner },
      { $setOnInsert: { items: [], revision: 0, expiresAt: new Date(Date.now() + 30 * 86400000) } },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
    cart = await GuestCart.findOne({ owner });
  }
  return await guestView(cart);
}

async function putGuestCart(owner, data) {
  const input = { items: Array.isArray(data?.items) ? data.items : [], revision: Number(data?.revision || 0), promoCode: data?.promoCode || '' };
  await quote(input.items, input.promoCode);
  const cart = await GuestCart.findOneAndUpdate(
    { owner, revision: input.revision },
    {
      $set: {
        items: input.items,
        promoCode: input.promoCode,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!cart) fail(409, 'Your cart changed in another tab. Refresh it and try again.');
  return await guestView(cart);
}

async function checkoutQuote(data) {
  return await quote(Array.isArray(data?.items) ? data.items : [], data?.promoCode);
}

module.exports = { getUserCart, putUserCart, deleteUserCart, getGuestCart, putGuestCart, checkoutQuote };
