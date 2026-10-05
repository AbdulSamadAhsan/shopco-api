const jwt = require('jsonwebtoken');
const { User } = require('../models/User.js');
const { secret } = require('../config/jwtSecret.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function auth(req, res, next) {
  const key = secret();
  try {
    const payload = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), key, {
      algorithms: ['HS256'],
      issuer: 'shopco-api',
      audience: 'shopco',
    });
    req.user = await User.findById(payload.sub);
  } catch {
    fail(401, 'Please sign in');
  }
  if (!req.user) fail(401, 'Please sign in');
  next();
}

module.exports = { auth };
