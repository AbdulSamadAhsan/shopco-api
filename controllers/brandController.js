const service = require('../services/brandService');

async function list(req, res) {
  const data = await service.listBrands();
  res.json({ success: true, count: data.length, data });
}

async function get(req, res) {
  const data = await service.getBrand(req.params.id);
  if (!data) throw Object.assign(new Error('Brand not found'), { status: 404 });
  res.json({ success: true, data });
}

module.exports = { list, get };
