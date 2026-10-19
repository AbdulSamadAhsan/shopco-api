const { OrderEmail } = require('../models/OrderEmail');
const { Order } = require('../models/Order');
const smtp = require('./smtpService');
const { orderEmail } = require('./orderEmailTemplate');
async function enqueue(orderId, session) {
  await OrderEmail.updateOne({ order: orderId }, { $setOnInsert: { order: orderId, status: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true, session });
}
async function deliver(orderId) {
  if (!smtp.configuration()) return { status: 'not_configured' };
  let job;
  try {
    const now = new Date();
    job = await OrderEmail.findOneAndUpdate({ order: orderId, attempts: { $lt: 5 }, $or: [{ status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } }, { status: 'sending', lockedUntil: { $lt: now } }] }, { $set: { status: 'sending', lockedUntil: new Date(Date.now() + 5 * 60000) }, $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!job) return { status: 'already_sent_or_not_due' };
    const order = await Order.findById(orderId).lean();
    if (!order || order.status === 'cancelled' || (order.paymentMethod === 'stripe' && order.paymentStatus !== 'paid')) {
      await OrderEmail.updateOne({ _id: job._id, status: 'sending' }, { $set: { status: 'skipped' }, $unset: { lockedUntil: 1 } });
      return { status: 'skipped' };
    }
    const message = orderEmail(order);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to || '') || /[\r\n]/.test(message.to)) throw Object.assign(new Error('Invalid recipient'), { code: 'INVALID_RECIPIENT' });
    await smtp.send({ ...message, orderId: String(orderId) });
    await OrderEmail.updateOne({ _id: job._id, status: 'sending' }, { $set: { status: 'sent', sentAt: new Date() }, $unset: { lockedUntil: 1, lastErrorCode: 1 } });
    return { status: 'sent' };
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'EMAIL_DELIVERY_FAILED';
    if (job) await OrderEmail.updateOne({ _id: job._id, status: 'sending' }, { $set: { status: 'failed', lastErrorCode: code, nextAttemptAt: new Date(Date.now() + Math.min(60, 5 * 2 ** (job.attempts - 1)) * 60000) }, $unset: { lockedUntil: 1 } }).catch(() => {});
    console.error('Order confirmation email failed:', code);
    return { status: 'failed' };
  }
}
async function retryPending(limit = 10) {
  if (!smtp.configuration()) return { status: 'not_configured', processed: 0 };
  const now = new Date();
  const jobs = await OrderEmail.find({ attempts: { $lt: 5 }, $or: [{ status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } }, { status: 'sending', lockedUntil: { $lt: now } }] }).sort({ nextAttemptAt: 1 }).limit(limit).select('order').lean();
  const results = [];
  for (const job of jobs) results.push(await deliver(job.order));
  return { processed: results.length, sent: results.filter(result => result.status === 'sent').length };
}
module.exports = { enqueue, deliver, retryPending };
