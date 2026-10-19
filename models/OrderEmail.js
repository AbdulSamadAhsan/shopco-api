const { Schema, options, model } = require('./schema');
const OrderEmail = model('OrderEmail', new Schema({
  order: { type: Schema.Types.ObjectId, required: true, unique: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'skipped'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lockedUntil: Date,
  sentAt: Date,
  lastErrorCode: String,
}, options));
OrderEmail.schema.index({ status: 1, nextAttemptAt: 1 });
module.exports = { OrderEmail };
