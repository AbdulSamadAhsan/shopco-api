const { Schema, options, model, item } = require('./schema.js');
const GuestCart = model(
  'GuestCart',
  new Schema(
    {
      owner: { type: String, unique: true, required: true },
      items: [item],
      revision: { type: Number, default: 0 },
      promoCode: String,
      expiresAt: { type: Date, expires: 0 },
    },
    options,
  ),
);

module.exports = { GuestCart };
