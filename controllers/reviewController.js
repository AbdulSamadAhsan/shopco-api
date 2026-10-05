const service = require('../services/reviewService.js');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const listReviews = async (req, res) => ok(res, await service.listReviews(req.params.id));
const createReview = async (req, res) =>
  ok(res, await service.createReview(req.user._id, req.user.name, req.params.id, req.body), 201);

module.exports = { listReviews, createReview };
