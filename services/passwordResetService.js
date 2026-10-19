const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { User } = require('../models/User');
const { PasswordResetLimit } = require('../models/PasswordResetLimit');
const smtp = require('./smtpService');
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const generic = { message: 'If an account exists for this email, a password reset link will be sent. Check your inbox and spam folder.' };
async function allow(key, maximum) {
  const bucket = Math.floor(Date.now() / (15 * 60000));
  const record = await PasswordResetLimit.findOneAndUpdate({ _id: digest(`${key}:${bucket}`) }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 30 * 60000) } }, { upsert: true, returnDocument: 'after' });
  return record.count <= maximum;
}
function resetUrl(token) {
  const origin = new URL(process.env.FRONTEND_URL || 'https://reactshopco.vercel.app');
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) throw new Error('Invalid storefront origin');
  return `${origin.origin}/reset-password#token=${token}`;
}
async function requestReset(data, source = 'unknown') {
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
  if (!(await allow(`request-ip:${source}`, 30)) || !(await allow(`request-email:${email}`, 3))) return { ...generic };
  const token = randomBytes(32).toString('hex');
  const link = resetUrl(token);
  const user = await User.findOneAndUpdate({ email }, { $set: { passwordResetHash: digest(token), passwordResetExpiresAt: new Date(Date.now() + 30 * 60000) } }, { returnDocument: 'after' });
  if (user) {
    try {
      await smtp.send({ to: user.email, subject: 'Reset your SHOP.CO password', text: `Use this link to reset your SHOP.CO password:\n\n${link}\n\nThis link expires in 30 minutes and can only be used once. If you did not request it, ignore this email. Your password has not changed.`, html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h1>SHOP.CO</h1><h2>Reset your password</h2><p>Use the link below to choose a new password.</p><p><a href="${link}" style="display:inline-block;padding:14px 24px;background:#111;color:white;border-radius:24px;text-decoration:none">Reset password</a></p><p>This link expires in 30 minutes and can only be used once.</p><p>If you did not request it, ignore this email. Your password has not changed.</p></div>` });
    } catch (error) {
      console.error('Password reset email failed:', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'EMAIL_DELIVERY_FAILED');
    }
  }
  return { ...generic };
}
async function confirmReset(data, source = 'unknown') {
  const token = typeof data?.token === 'string' ? data.token : '';
  const password = typeof data?.password === 'string' ? data.password : '';
  if (!/^[a-f0-9]{64}$/.test(token)) fail(400, 'This reset link is invalid or expired. Request a new link');
  if (password.length < 10 || Buffer.byteLength(password) > 72) fail(400, 'Use a password of at least 10 characters and at most 72 bytes');
  if (!(await allow(`confirm-ip:${source}`, 20))) fail(429, 'Too many attempts. Please try again in 15 minutes');
  const user = await User.findOneAndUpdate({ passwordResetHash: digest(token), passwordResetExpiresAt: { $gt: new Date() } }, { $set: { password: await bcrypt.hash(password, 12) }, $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1 }, $inc: { sessionVersion: 1 } }, { returnDocument: 'after', runValidators: true });
  if (!user) fail(400, 'This reset link is invalid or expired. Request a new link');
  return { message: 'Password reset successfully. Sign in with your new password.' };
}
module.exports = { requestReset, confirmReset };
