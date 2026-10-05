const service = require('../services/orderService.js');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
async function createOrder(req, res) {
  const { order, created } = await service.createOrder(
    req.user._id,
    req.body,
    req.headers['idempotency-key'],
  );
  ok(res, order, created ? 201 : 200);
}
const listOrders = async (req, res) => ok(res, await service.listOrders(req.user._id));
const getOrder = async (req, res) => ok(res, await service.getOrder(req.user._id, req.params.id));

module.exports = { listOrders, getOrder, createOrder };
