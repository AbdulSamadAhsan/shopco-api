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
  jwt.sign({ sessionVersion: user.sessionVersion || 0 }, secret(), {
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
async function updateUser(userId, data) {
  const allowed = ['firstName', 'lastName', 'email', 'phone', 'currentPassword', 'newPassword'];
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length ||
      Object.keys(data).some(key => !allowed.includes(key) || typeof data[key] !== 'string'))
    fail(400, 'Provide only supported account fields as text');
  const values = {};
  for (const field of ['firstName', 'lastName']) {
    if (data[field] !== undefined) {
      values[field] = data[field].trim();
      if (!values[field] || values[field].length > 100) fail(400, 'First and last name must be 1 to 100 characters');
    }
  }
  if (data.email !== undefined) {
    values.email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) fail(400, 'Enter a valid email address');
  }
  if (data.phone !== undefined) {
    values.phone = data.phone.trim();
    if (values.phone && (values.phone.length > 30 || !/^\+?[0-9 ()-]+$/.test(values.phone) ||
        values.phone.replace(/\D/g, '').length < 7 || values.phone.replace(/\D/g, '').length > 15))
      fail(400, 'Enter a valid mobile number with 7 to 15 digits');
  }
  const changePassword = data.newPassword !== undefined && data.newPassword !== '';
  if (changePassword && (data.newPassword.length < 10 || Buffer.byteLength(data.newPassword) > 72))
    fail(400, 'New password must be at least 10 characters and at most 72 bytes');
  if (!Object.keys(values).length && !changePassword) fail(400, 'No account changes provided');
  const user = await User.findById(userId).select(changePassword ? '+password' : '');
  if (!user) fail(401, 'Please sign in');
  if (changePassword && await bcrypt.compare(data.newPassword, user.password))
    fail(400, 'New password must be different from your current password.');
  const sensitive = changePassword || (values.email !== undefined && values.email !== user.email);
  const previous = publicUser(user);
  values.name = [values.firstName ?? previous.firstName, values.lastName ?? previous.lastName].filter(Boolean).join(' ');
  if (changePassword) values.password = await bcrypt.hash(data.newPassword, 12);
  let updated;
  try {
    updated = await User.findOneAndUpdate(
      { _id: userId, ...(user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }) },
      { $set: values, ...(sensitive && { $inc: { sessionVersion: 1 } }) },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (error) {
    if (error.code === 11000) fail(409, 'An account with this email already exists');
    throw error;
  }
  if (!updated) fail(409, 'Your account changed. Refresh and try again.');
  return { user: publicUser(updated), ...(changePassword ? { requiresLogin: true } : { token: token(updated) }) };
}
module.exports.updateUser = updateUser;


async function deleteUser(userId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(key => key !== 'currentPassword') ||
      typeof data.currentPassword !== 'string' || !data.currentPassword || Buffer.byteLength(data.currentPassword) > 72)
    fail(400, 'Enter your current password to delete your account.');
  const user = await User.findById(userId).select('+password');
  if (!user) fail(401, 'Please sign in');
  if (!await bcrypt.compare(data.currentPassword, user.password)) fail(403, 'Your current password is incorrect.');
  const mongoose = require('mongoose');
  const { Cart } = require('../models/Cart');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await User.deleteOne({ _id: userId, password: user.password,
        ...(user.sessionVersion ? { sessionVersion: user.sessionVersion } : { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }) }, { session });
      if (!result.deletedCount) fail(409, 'Your account changed. Refresh and try again.');
      await Cart.deleteMany({ user: userId }, { session });
      // Orders retain their purchase-time snapshots and are never deleted here.
    });
  } finally { await session.endSession(); }
  return { deleted: true };
}
module.exports.deleteUser = deleteUser;

