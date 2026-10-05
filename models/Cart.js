const { Schema, options, model, item } = require('./schema.js');
const Cart = model(
  'Cart',
  new Schema({ user: { type: Schema.Types.ObjectId, unique: true }, items: [item] }, options),
);

module.exports = { Cart };
