const { Schema, options, model } = require('./schema.js');
const Product = model(
  'Product',
  new Schema(
    {
      name: { type: String, required: true },
      slug: { type: String, unique: true, required: true },
      description: String,
      price: { type: Number, required: true, min: 0 },
      oldPrice: Number,
      discount: String,
      image: { type: String, required: true },
      images: [String],
      category: String,
      brand: String,
      style: String,
      color: String,
      colors: [String],
      sizes: [String],
      sizePrices: [new Schema({ size: String, price: { type: Number, min: 0 } }, { _id: false })],
      stock: { type: Number, default: 0, min: 0 },
      rating: { type: Number, default: 5, min: 0, max: 5 },
      featured: { type: Boolean, default: false },
      sales: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);

module.exports = { Product };
