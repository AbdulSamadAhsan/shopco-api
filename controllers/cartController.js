const service = require('../services/cartService.js');
const crypto = require('node:crypto');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const getUserCart = async (req, res) => ok(res, await service.getUserCart(req.user._id));
const putUserCart = async (req, res) => ok(res, await service.putUserCart(req.user._id, req.body));
const deleteUserCart = async (req, res) => ok(res, await service.deleteUserCart(req.user._id));
const getOwner = (req, res) => {
  const token = String(req.headers['x-cart-token'] || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).json({ success: false, message: 'A valid cart token is required' });
    return null;
  }
  return crypto.createHash('sha256').update(token).digest('hex');
};
const getGuestCart = async (req, res) => {
  const cartOwner = getOwner(req, res);
  return cartOwner ? ok(res, await service.getGuestCart(cartOwner)) : undefined;
};
const putGuestCart = async (req, res) => {
  const cartOwner = getOwner(req, res);
  return cartOwner ? ok(res, await service.putGuestCart(cartOwner, req.body)) : undefined;
};
const checkoutQuote = async (req, res) => ok(res, await service.checkoutQuote(req.body));

module.exports = { getUserCart, putUserCart, deleteUserCart, getGuestCart, putGuestCart, checkoutQuote };
