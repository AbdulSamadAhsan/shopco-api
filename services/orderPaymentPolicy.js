// Shared policy in both APIs: completion settles cash on delivery, never card payments.
const { Order } = require('../models/Order');
const completed = ['delivered', 'completed'];
const unsettled = ['unpaid', 'pending', '', null];

async function reconcileCompletedPayment(order, scope = {}, session) {
  if (!order || order.paymentMethod !== 'cash_on_delivery' ||
      !completed.includes(order.status) || !unsettled.includes(order.paymentStatus ?? null)) return order;
  const identity = { ...scope, _id: order._id };
  const repaired = await Order.findOneAndUpdate(
    { ...identity, paymentMethod: 'cash_on_delivery', status: { $in: completed }, paymentStatus: { $in: unsettled } },
    { $set: { paymentStatus: 'paid' } },
    { new: true, runValidators: true, timestamps: false, ...(session && { session }) }
  ).lean();
  if (repaired) return repaired;
  // A refund or cancellation may have won the race. Return its actual state.
  let latest = Order.findOne(identity);
  if (session) latest = latest.session(session);
  return latest.lean();
}
module.exports = { reconcileCompletedPayment };
