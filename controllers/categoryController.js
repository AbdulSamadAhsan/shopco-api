const service = require('../services/categoryService');

async function list(req, res) {
  const data = await service.listCategories();
  res.json({ success: true, count: data.length, data });
}

async function get(req, res) {
  const data = await service.getCategory(req.params.id);
  if (!data) throw Object.assign(new Error('Category not found'), { status: 404 });
  res.json({ success: true, data });
}

module.exports = { list, get };
