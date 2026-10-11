const Stripe = require('stripe');
let client;
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_'))
    throw Object.assign(new Error('Stripe test payments are not configured'), { status: 503 });
  client ||= new Stripe(key, { maxNetworkRetries: 2, timeout: 15000 });
  return client;
}
function checkoutOrigin() {
  const url = new URL(process.env.FRONTEND_URL || 'https://reactshopco.vercel.app');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new Error('Invalid frontend URL');
  return url.origin;
}
module.exports = { stripe, checkoutOrigin };
