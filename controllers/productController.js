const service = require('../services/productService.js');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
async function list(req, res) {
  const { data, pagination } = await service.listProducts(req.query);
  ok(res, data, 200, { pagination });
}
const filters = async (req, res) => ok(res, await service.filters());
const categories = async (req, res) => ok(res, await service.categories());
const brands = async (req, res) => ok(res, await service.brands());
const get = async (req, res) => ok(res, await service.getProduct(req.params.id));
const create = async (req, res) => ok(res, await service.createProduct(req.body), 201);

module.exports = { list, filters, categories, brands, get, create };
