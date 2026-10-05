const { Schema, options, model } = require('./schema.js');
const Review = model(
  'Review',
  new Schema(
    {
      product: Schema.Types.ObjectId,
      user: Schema.Types.ObjectId,
      name: String,
      rating: Number,
      comment: String,
    },
    options,
  ),
);
Review.schema.index({ product: 1, user: 1 }, { unique: true });

module.exports = { Review };
