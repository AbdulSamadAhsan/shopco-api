const { Schema, options, model } = require('./schema');
const PasswordResetLimit = model('PasswordResetLimit', new Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expiresAt: Date,
}, options));
PasswordResetLimit.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = { PasswordResetLimit };
