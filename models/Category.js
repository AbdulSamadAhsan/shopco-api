const { Schema, options, model } = require('./schema.js');
const Category = model(
  'Category',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      description: { type: String, trim: true },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);

module.exports = { Category };
