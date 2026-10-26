const { Schema, model } = require('./schema');
const StoreSettings = model('StoreSettings', new Schema({ key: String, currency: String, exchangeRate: Number }, { collection: 'storesettings' }));
module.exports = { StoreSettings };
