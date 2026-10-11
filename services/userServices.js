const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User.js');
const { secret } = require('../config/jwtSecret.js');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function publicUser(user) {
  const [legacyFirst = '', ...legacyLast] = (user.name || '').trim().split(/\s+/);
  const firstName = user.firstName || legacyFirst;
  const lastName = user.lastName || legacyLast.join(' ');
  return { _id: user._id, name: [firstName, lastName].filter(Boolean).join(' '), firstName, lastName, email: user.email, phone: user.phone || '' };
}
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
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const legacy = clean(data?.name).split(/\s+/);
  const hasNames = data?.firstName !== undefined || data?.lastName !== undefined;
  const firstName = hasNames ? clean(data.firstName) : legacy.shift();
  const lastName = hasNames ? clean(data.lastName) : legacy.join(' ');
  if (!firstName || (hasNames && !lastName) || firstName.length > 100 || lastName.length > 100)
    fail(400, 'First and last name are required and must be at most 100 characters each');
  const email = clean(data?.email).toLowerCase();
  // Older clients and accounts may omit phone; validate it whenever supplied.
  const phone = clean(data?.phone);
  if (data?.phone !== undefined && (typeof data.phone !== 'string' ||
      phone.length > 30 || !/^\+?[0-9 ()-]+$/.test(phone) ||
      phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15))
    fail(400, 'Enter a valid mobile number with 7 to 15 digits');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(400, 'A valid email is required');
  const password = typeof data?.password === 'string' ? data.password : '';
  if (password.length < minPassword || Buffer.byteLength(password) > 72)
    fail(400, `Password must be at least ${minPassword} characters and at most 72 bytes`);
  let user;
  try {
    user = await User.create({ firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' '), email, phone, password: await bcrypt.hash(password, 12) });
  } catch (error) {
    if (error.code === 11000) fail(409, 'An account with this email already exists');
    throw error;
  }
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
