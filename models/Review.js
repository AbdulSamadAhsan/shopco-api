const { Schema, options, model } = require('./schema.js');
const Review = model(
  'Review',
  new Schema(
    {
      product: Schema.Types.ObjectId,
      user: Schema.Types.ObjectId,
      order: Schema.Types.ObjectId,
      size: String,
      color: String,
      name: String,
      rating: { type: Number, required: true, min: 1, max: 5 },
      comment: { type: String, maxlength: 2000, default: '' },
    },
    options,
  ),
);
Review.schema.index({ product: 1, user: 1, order: 1, size: 1, color: 1 }, { unique: true, partialFilterExpression: { order: { $exists: true } } });

module.exports = { Review };
