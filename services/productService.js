const { Product } = require('../models/Product.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

async function listProducts(query) {
  const q = { page: 1, limit: 24, sort: 'newest', ...(query || {}) },
    filter = { active: true };
  for (const key of ['category', 'brand', 'style']) if (q[key]) filter[key] = q[key];
  if (q.color) filter.colors = q.color;
  if (q.size) filter.sizes = q.size;
  if (q.featured) filter.featured = q.featured === 'true';
  if (q.search) filter.name = { $regex: q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (q.minPrice !== undefined || q.maxPrice !== undefined)
    filter.price = {
      ...(q.minPrice !== undefined && { $gte: q.minPrice }),
      ...(q.maxPrice !== undefined && { $lte: q.maxPrice }),
    };
  const sorts = {
    newest: { createdAt: -1, _id: -1 },
    'price-asc': { price: 1, _id: 1 },
    'price-desc': { price: -1, _id: 1 },
    rating: { rating: -1, _id: 1 },
    popular: { sales: -1, _id: 1 },
    name: { name: 1, _id: 1 },
  };
  q.page = Number(q.page) || 1;
  q.limit = Number(q.limit) || 24;
  const [data, total] = await Promise.all([
    Product.find(filter)
      .sort(sorts[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { data, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } };
}
async function filters() {
  const fields = ['category', 'brand', 'style', 'colors', 'sizes'];
  const values = await Promise.all(fields.map((field) => Product.distinct(field, { active: true })));
  return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
}
const categories = () => Product.distinct('category', { active: true });
const brands = () => Product.distinct('brand', { active: true });
async function getProduct(productId) {
  const product = await Product.findOne({ _id: productId, active: true }).lean();
  if (!product) fail(404, 'Product not found');
  return product;
}

async function createProduct(data) {
  const product = { ...(data || {}) };
  if (!product.slug || !product.name || product.price === undefined || !product.image) {
    const error = new Error('name, slug, price and image are required');
    error.status = 400;
    throw error;
  }
  if (product.oldPrice !== undefined && product.price < product.oldPrice) {
    product.discount = `-${Math.round((1 - product.price / product.oldPrice) * 100)}%`;
  }
  return Product.findOneAndUpdate({ slug: product.slug }, { $set: product }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
}

module.exports = { listProducts, filters, categories, brands, getProduct, createProduct };
