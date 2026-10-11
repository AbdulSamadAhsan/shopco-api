const { Subscriber } = require('../models/Subscriber.js');
async function subscribe(data) {
  const input = { email: String(data?.email || '').trim().toLowerCase() };
  if (input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw Object.assign(new Error('Enter a valid email address'), { status: 400 });
  await Subscriber.updateOne(
    { email: input.email },
    { $setOnInsert: { consentAt: new Date() } },
    { upsert: true },
  );
  return { message: 'Subscription saved' };
}

module.exports = { subscribe };
