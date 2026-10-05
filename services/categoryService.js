const { Category } = require('../models/Category');
const listCategories = () => Category.find({ active: true }).sort({ name: 1 }).lean();
const getCategory = id => Category.findOne({ _id: id, active: true }).lean();

module.exports = { listCategories, getCategory };
