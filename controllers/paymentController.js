const service = require('../services/paymentService');
const createCheckout = async (req, res) => res.status(200).json({ success: true, data: await service.startCheckout(req.checkoutOwner, req.body, req.headers['idempotency-key']) });
const checkoutStatus = async (req, res) => res.json({ success: true, data: await service.checkoutStatus(req.checkoutOwner, req.params.id) });
const cancelCheckout = async (req, res) => res.json({ success: true, data: await service.cancelCheckout(req.checkoutOwner, req.params.id) });
const webhook = async (req, res) => res.json(await service.webhook(req.body, req.headers['stripe-signature']));
module.exports = { createCheckout, checkoutStatus, cancelCheckout, webhook };
