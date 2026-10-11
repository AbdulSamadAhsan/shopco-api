const { Schema, options, model } = require('./schema.js');
const User = model(
  'User',
  new Schema(
    {
      name: String,
      firstName: { type: String, trim: true, maxlength: 100 },
      lastName: { type: String, trim: true, maxlength: 100 },
      phone: { type: String, trim: true, maxlength: 30, default: '' },
      email: { type: String, unique: true, required: true },
      password: { type: String, required: true, select: false },
    },
    options,
  ),
);

module.exports = { User };
