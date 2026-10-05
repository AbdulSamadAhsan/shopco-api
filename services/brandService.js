const { Brand } = require('../models/Brand');
const listBrands = () => Brand.find({ active: true }).sort({ name: 1 }).lean();
const getBrand = id => Brand.findOne({ _id: id, active: true }).lean();

module.exports = { listBrands, getBrand };
