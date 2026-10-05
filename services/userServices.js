const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User.js');
const { secret } = require('../config/jwtSecret.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const publicUser = (user) => ({ _id: user._id, name: user.name, email: user.email });
const token = (user) =>
  jwt.sign({}, secret(), {
    subject: String(user._id),
    expiresIn: '7d',
    algorithm: 'HS256',
    issuer: 'shopco-api',
    audience: 'shopco',
  });
async function createUser(data, minPassword = 10) {
  secret();
  const input = { name: String(data?.name || '').trim(), email: String(data?.email || '').trim().toLowerCase(), password: String(data?.password || '') };
  const user = await User.create({ ...input, password: await bcrypt.hash(input.password, 12) });
  return { user: publicUser(user), token: token(user) };
}
async function loginUser(data) {
  const input = { email: String(data?.email || '').trim().toLowerCase(), password: String(data?.password || '') };
  const user = await User.findOne({ email: input.email }).select('+password');
  const match = await bcrypt.compare(
    input.password,
    user?.password || '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
  );
  if (!user || !match) fail(401, 'Invalid email or password');
  return { user: publicUser(user), token: token(user) };
}

module.exports = { publicUser, createUser, loginUser };
