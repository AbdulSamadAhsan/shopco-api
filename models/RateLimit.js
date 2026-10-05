const { Schema, options, model } = require('./schema.js');
const RateLimit = model(
  'RateLimit',
  new Schema({ _id: String, count: Number, expiresAt: Date }, { versionKey: false }),
);
RateLimit.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = { RateLimit };
