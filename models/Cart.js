const { Schema, options, model, item } = require('./schema.js');
const Cart = model(
  'Cart',
  new Schema({ user: { type: Schema.Types.ObjectId, unique: true }, items: [item] }, options),
);

module.exports = { Cart };
// I found a checkout blocker: after the first order succeeds, checking out with the second product displays the first order’s confirmation again. Refreshing does not clear it. I’m testing whether signing out and back in restores checkout, and I’ll document the defect either way. correct this bugs and redeploy the webiste