const { StoreSettings } = require('../models/StoreSettings');
const currencies = ['USD', 'PKR'];
async function getCurrency() {
  const settings = await StoreSettings.findOne({ key: 'store' }).lean();
  if (!settings || settings.currency === 'USD') return { currency: 'USD', exchangeRate: 1, baseCurrency: 'USD' };
  if (!currencies.includes(settings.currency) || !Number.isFinite(settings.exchangeRate) || settings.exchangeRate <= 0) {
    throw Object.assign(new Error('Store currency is not configured correctly'), { status: 503 });
  }
  return { currency: settings.currency, exchangeRate: settings.exchangeRate, baseCurrency: 'USD' };
}
const convert = (amount, rate) => Math.round((Number(amount) * rate + Number.EPSILON) * 100) / 100;
function convertQuote(quote, settings) {
  const items = quote.items.map(item => ({ ...item, price: convert(item.price, settings.exchangeRate) }));
  const subtotal = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  const discount = Math.min(subtotal, Math.round(convert(quote.discount, settings.exchangeRate) * 100));
  const gst = Math.round((subtotal - discount) * quote.gstRate);
  const delivery = Math.round(convert(quote.deliveryFee, settings.exchangeRate) * 100);
  return { ...quote, ...settings, items, subtotal: subtotal / 100, discount: discount / 100, gst: gst / 100,
    deliveryFee: delivery / 100, total: (subtotal - discount + gst + delivery) / 100 };
}
module.exports = { getCurrency, convertQuote, convert };
