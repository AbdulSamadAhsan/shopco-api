const { Subscriber } = require('../models/Subscriber.js');
async function subscribe(data) {
  const input = { email: String(data?.email || '').trim().toLowerCase() };
  await Subscriber.updateOne(
    { email: input.email },
    { $setOnInsert: { consentAt: new Date() } },
    { upsert: true },
  );
  return { message: 'Subscription saved' };
}

module.exports = { subscribe };
