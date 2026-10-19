const jwt = require('jsonwebtoken');
const { User } = require('../models/User.js');
const { secret } = require('../config/jwtSecret.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function auth(req, res, next) {
  const key = secret();
  let payload;
  try {
    payload = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), key, {
      algorithms: ['HS256'],
      issuer: 'shopco-api',
      audience: 'shopco',
    });
    req.user = await User.findById(payload.sub);
  } catch {
    fail(401, 'Please sign in');
  }
  if (!req.user) fail(401, 'Please sign in');
  if ((payload.sessionVersion ?? payload.v ?? 0) !== (req.user.sessionVersion || 0)) fail(401, 'Your password changed. Please sign in again');
  next();
}

module.exports = { auth };
