const mongoose = require('mongoose');
const config = require('../config/stripe');
const orders = require('./orderService');
const { Order } = require('../models/Order');
const { Product } = require('../models/Product');
const emails = require('./orderEmailService');
const { ownerFilter, paymentOwner } = require('./orderOwner');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const cents = value => Math.round(value * 100);

// Never trust redirect parameters or browser-provided amounts as proof of payment.
function verifySession(order, session) {
  if (session.livemode !== false || session.mode !== 'payment' ||
      session.client_reference_id !== String(order._id) ||
      session.metadata?.orderId !== String(order._id) ||
      session.metadata?.userId !== paymentOwner(order) ||
      session.amount_total !== cents(order.total) || session.currency !== order.currency.toLowerCase() ||
      (order.stripeSessionId && order.stripeSessionId !== session.id))
    fail(409, 'Payment details do not match this order');
}

async function applySession(session) {
  const id = session.metadata?.orderId;
  if (!mongoose.isObjectIdOrHexString(id)) fail(400, 'Invalid payment order');
  let order = await Order.findOne({ _id: id, paymentMethod: 'stripe' });
  if (!order) fail(404, 'Payment order not found');
  verifySession(order, session);
  const paid = session.status === 'complete' && session.payment_status === 'paid';
  const expired = session.status === 'expired' && session.payment_status !== 'paid';
  if (!paid && !expired) return order;
  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      // Only the first completion/expiration can change inventory or payment state.
      const changed = await Order.findOneAndUpdate(
        { _id: id, paymentMethod: 'stripe', status: 'awaiting_payment', paymentStatus: 'unpaid' },
        { $set: { status: paid ? 'pending' : 'cancelled', paymentStatus: paid ? 'paid' : 'expired',
          stripeSessionId: session.id, ...(paid && { stripePaymentIntentId: session.payment_intent }) } },
        { session: transaction, returnDocument: 'after' },
      );
      if (!changed) return;
      if (paid) await emails.enqueue(changed._id, transaction);
      if (expired) {
        for (const line of changed.items)
          await Product.updateOne({ _id: line.productId }, { $inc: { stock: line.quantity, sales: -line.quantity } }, { session: transaction });
      }
    });
  } finally { await transaction.endSession(); }
  if (paid) await emails.deliver(id);
  return Order.findById(id);
}

function sessionParameters(order, ui = 'hosted') {
  const currency = order.currency.toLowerCase();
  const origin = config.checkoutOrigin();
  const merchandise = cents(order.subtotal) - cents(order.discount);
  const lines = [];
  if (merchandise > 0) lines.push({ quantity: 1, price_data: { currency, unit_amount: merchandise,
    product_data: { name: 'SHOP.CO merchandise', description: order.items.map(i => `${i.name} (${i.size}, ${i.color}) x${i.quantity}`).join('; ').slice(0, 500) } } });
  if (cents(order.gst || 0) > 0) lines.push({ quantity: 1, price_data: { currency, unit_amount: cents(order.gst), product_data: { name: 'GST (16%)' } } });
  if (cents(order.deliveryFee) > 0) lines.push({ quantity: 1, price_data: { currency, unit_amount: cents(order.deliveryFee), product_data: { name: 'Delivery' } } });
  return {
    mode: 'payment', allowed_payment_method_types: ['card'], line_items: lines,
    customer_email: order.shipping.email,
    client_reference_id: String(order._id),
    metadata: { orderId: String(order._id), userId: paymentOwner(order) },
    payment_intent_data: { metadata: { orderId: String(order._id) } },
    ...(ui === 'elements' ? {
      ui_mode: 'elements', return_url: `${origin}/checkout?session_id={CHECKOUT_SESSION_ID}`,
    } : {
      success_url: `${origin}/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout?payment=cancelled`,
    }),
    expires_at: Math.floor(new Date(order.stripeExpiresAt).getTime() / 1000),
  };
}

async function startCheckout(userId, data, key) {
  const stripe = config.stripe();
  if (!process.env.STRIPE_WEBHOOK_SECRET) fail(503, 'Payment confirmation is not configured');
  const { order } = await orders.createOrder(userId, { ...data, paymentMethod: 'stripe' }, key, 'stripe');
  if (order.paymentStatus === 'paid') return { order, paid: true };
  if (order.status !== 'awaiting_payment') fail(409, 'This checkout has expired. Start a new order.');
  let session;
  try {
    session = order.stripeSessionId
      ? await stripe.checkout.sessions.retrieve(order.stripeSessionId)
      : await stripe.checkout.sessions.create(sessionParameters(order, data.checkoutUi), { idempotencyKey: `shopco-${order._id}` });
  } catch (error) {
    // An uncertain Stripe response must keep the reservation and the retry key.
    // Do not create a second session or mark this order as paid.
    fail(502, 'Unable to open Stripe checkout. Retry this same order.');
  }
  verifySession(order, session);
  await Order.updateOne({ _id: order._id }, { $set: { stripeSessionId: session.id } });
  if (session.status !== 'open') {
    const updated = await applySession(session);
    if (updated.paymentStatus === 'paid') return { order: updated, paid: true };
    fail(409, 'This checkout has expired. Start a new order.');
  }
  return { orderId: String(order._id), sessionId: session.id, url: session.url,
    ...(session.ui_mode === 'elements' && { clientSecret: session.client_secret,
      customerName: [order.shipping.firstName, order.shipping.lastName].filter(Boolean).join(' ') }),
  };
}

async function checkoutStatus(userId, sessionId) {
  if (typeof sessionId !== 'string' || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) fail(400, 'Invalid checkout session');
  const session = await config.stripe().checkout.sessions.retrieve(sessionId);
  // Check ownership before disclosing or updating the order through this user route.
  const order = await Order.findOne({ _id: session.metadata?.orderId, ...ownerFilter(userId), paymentMethod: 'stripe' });
  if (!order) fail(404, 'Payment order not found');
  verifySession(order, session);
  const updated = await applySession(session);
  return { order: updated, paid: updated.paymentStatus === 'paid', status: session.status };
}

async function cancelCheckout(userId, sessionId) {
  const current = await checkoutStatus(userId, sessionId);
  if (current.paid || current.status === 'expired') return current;
  const session = await config.stripe().checkout.sessions.expire(sessionId);
  const order = await applySession(session);
  return { order, paid: order.paymentStatus === 'paid', status: session.status };
}

async function webhook(body, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) fail(503, 'Payment confirmation is not configured');
  let event;
  try { event = config.stripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { fail(400, 'Invalid Stripe webhook signature'); }
  if (event.livemode) fail(400, 'Only Stripe test events are accepted');
  if (['checkout.session.completed', 'checkout.session.expired'].includes(event.type)) {
    // Other apps can share a Stripe account. Ignore their sessions.
    if (event.data.object.metadata?.orderId && event.data.object.metadata?.userId)
      await applySession(await config.stripe().checkout.sessions.retrieve(event.data.object.id));
  }
  return { received: true };
}
module.exports = { startCheckout, checkoutStatus, cancelCheckout, webhook, applySession, verifySession, sessionParameters };
