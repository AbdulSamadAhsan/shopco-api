const { Schema, options, model } = require('./schema.js');
const Subscriber = model(
  'Subscriber',
  new Schema({ email: { type: String, unique: true }, consentAt: Date }, options),
);

module.exports = { Subscriber };
