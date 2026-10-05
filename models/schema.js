const mongoose = require('mongoose');
const { Schema } = mongoose;
const options = { timestamps: true, versionKey: false };
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const item = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: Number,
    size: String,
    color: String,
  },
  { _id: false },
);

module.exports = { options, model, item, Schema };
