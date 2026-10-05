const { Schema, options, model } = require('./schema.js');
const User = model(
  'User',
  new Schema(
    {
      name: String,
      email: { type: String, unique: true, required: true },
      password: { type: String, required: true, select: false },
    },
    options,
  ),
);

module.exports = { User };
