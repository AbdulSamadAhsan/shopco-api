const { createHash } = require('node:crypto');
const { auth } = require('./auth');

async function checkoutOwner(req, res, next) {
  if (req.headers.authorization) {
    return auth(req, res, () => {
      req.checkoutOwner = req.user._id;
      next();
    });
  }
  const token = req.headers['x-cart-token'];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw Object.assign(new Error('A valid cart token is required for guest checkout'), { status: 400 });
  }
  req.checkoutOwner = { guestTokenHash: createHash('sha256').update(token).digest('hex') };
  next();
}

module.exports = { checkoutOwner };
