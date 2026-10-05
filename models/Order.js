const { Schema, options, model } = require('./schema.js');
const Order = model(
  'Order',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, required: true },
      idempotencyKey: { type: String, required: true },
      requestHash: String,
      items: [
        {
          productId: Schema.Types.ObjectId,
          name: String,
          image: String,
          price: Number,
          quantity: Number,
          size: String,
          color: String,
          _id: false,
        },
      ],
      shipping: {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zip: String,
        country: String,
      },
      subtotal: Number,
      discount: Number,
      deliveryFee: Number,
      total: Number,
      currency: { type: String, default: 'USD' },
      paymentMethod: { type: String, default: 'cash_on_delivery' },
      paymentStatus: { type: String, default: 'unpaid' },
      status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending',
      },
    },
    options,
  ),
);
Order.schema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

module.exports = { Order };
