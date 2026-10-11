const mongoose = require('mongoose');
const { createHash } = require('node:crypto');
const { Product } = require('../models/Product.js');
const { Cart } = require('../models/Cart.js');
const { Order } = require('../models/Order.js');
const { quote } = require('./checkoutService.js');
const { validateOrder } = require('./orderValidation.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function createOrder(userId, data, idempotencyKey) {
  const input = validateOrder(data, idempotencyKey);
  const key = idempotencyKey;
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const lookup = { user: userId, idempotencyKey: key };
  let order = await Order.findOne(lookup);
  if (order) {
    if (order.requestHash !== hash) fail(409, 'Idempotency key was already used with different details');
    return { order, created: false };
  }
  const session = await mongoose.startSession();
  let created = true;
  try {
    await session.withTransaction(async () => {
      const priced = await quote(input.items, input.promoCode, session);
      for (const line of priced.items) {
        const result = await Product.updateOne(
          { _id: line.productId, active: true, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity, sales: line.quantity } },
          { session },
        );
        if (!result.modifiedCount) fail(409, 'Stock changed. Please refresh your cart.');
      }
      [order] = await Order.create(
        [
          {
            ...lookup,
            ...priced,
            requestHash: hash,
            shipping: input.shipping,
            paymentMethod: input.paymentMethod,
          },
        ],
        { session },
      );
      await Cart.updateOne({ user: userId }, { items: [] }, { session });
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    order = await Order.findOne(lookup);
    if (!order || order.requestHash !== hash) fail(409, 'Idempotency key conflict');
    created = false;
  } finally {
    await session.endSession();
  }
  return { order, created };
}

async function listOrders(userId) {
  return await Order.find({ user: userId }).sort({ createdAt: -1 }).limit(100).lean();
}

async function getOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) fail(404, 'Order not found');
  return order;
}


module.exports = { createOrder, listOrders, getOrder };
