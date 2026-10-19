const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const { PasswordResetLimit } = require('../models/PasswordResetLimit');
const smtp = require('../services/smtpService');
const service = require('../services/passwordResetService');
const { auth } = require('../middleware/auth');
afterEach(() => mock.restoreAll());
const email = 'reset@example.com';
function setup(userExists = true) {
  let user = userExists ? { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', email, sessionVersion: 0 } : null;
  const rate = mock.method(PasswordResetLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
  const write = mock.method(User, 'findOneAndUpdate', async (filter, update) => {
    if (!user || (filter.passwordResetHash && (filter.passwordResetHash !== user.passwordResetHash || user.passwordResetExpiresAt <= filter.passwordResetExpiresAt.$gt))) return null;
    Object.assign(user, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete user[key];
    if (update.$inc) user.sessionVersion++;
    return user;
  });
  const send = mock.method(smtp, 'send', async () => {});
  return { rate, write, send, getUser: () => user };
}
function linkToken(send) { return new URL(send.mock.calls[0].arguments[0].text.match(/https?:\/\/\S+/)[0]).hash.split('=')[1]; }
test('reset request sends a 30-minute link and stores only its hash', async () => {
  const { write, send, getUser } = setup();
  const result = await service.requestReset({ email: ' RESET@example.com ' }, 'test-source');
  assert.deepEqual(write.mock.calls[0].arguments[0], { email });
  const token = linkToken(send);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(getUser().passwordResetHash, createHash('sha256').update(token).digest('hex'));
  assert.ok(getUser().passwordResetExpiresAt > Date.now() + 29 * 60000);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(send.mock.calls[0].arguments[0].to, email);
});
test('unknown accounts and SMTP failure return the same generic response', async () => {
  const fixture = setup();
  fixture.send.mock.mockImplementation(async () => { throw Object.assign(new Error('Private SMTP details'), { code: 'EAUTH' }); });
  const known = await service.requestReset({ email });
  fixture.write.mock.mockImplementation(async () => null);
  const unknown = await service.requestReset({ email: 'unknown@example.com' });
  assert.deepEqual(known, unknown);
  assert.equal(fixture.send.mock.callCount(), 1);
});
test('reset tokens are single-use and passwords are hashed while old sessions are revoked', async () => {
  const { send, getUser, write } = setup();
  await service.requestReset({ email });
  const token = linkToken(send);
  await service.confirmReset({ token, password: 'new-password-for-tests' });
  assert.ok(await bcrypt.compare('new-password-for-tests', getUser().password));
  assert.equal(getUser().sessionVersion, 1);
  assert.equal(getUser().passwordResetHash, undefined);
  assert.equal(getUser().passwordResetExpiresAt, undefined);
  assert.equal(write.mock.calls[1].arguments[2].runValidators, true);
  await assert.rejects(service.confirmReset({ token, password: 'another-test-password' }), { status: 400 });
});
test('expired links cannot change the password', async () => {
  const { send, getUser } = setup();
  await service.requestReset({ email });
  const token = linkToken(send);
  getUser().passwordResetExpiresAt = new Date(0);
  await assert.rejects(service.confirmReset({ token, password: 'another-test-password' }), { status: 400 });
  assert.equal(getUser().password, undefined);
});
test('invalid passwords, malformed tokens and invalid emails never write users', async () => {
  const { write } = setup();
  for (const data of [{ token: 'bad', password: 'long-enough-password' }, { token: 'a'.repeat(64), password: 'short' }, { token: 'a'.repeat(64), password: 'é'.repeat(40) }]) await assert.rejects(service.confirmReset(data), { status: 400 });
  await assert.rejects(service.requestReset({ email: 'invalid' }), { status: 400 });
  assert.equal(write.mock.callCount(), 0);
});
test('rate-limited requests do not send or replace tokens', async () => {
  const { rate, write, send } = setup();
  rate.mock.mockImplementation(async () => ({ count: 100 }));
  const result = await service.requestReset({ email });
  assert.match(result.message, /If an account exists/);
  assert.equal(write.mock.callCount(), 0); assert.equal(send.mock.callCount(), 0);
  await assert.rejects(service.confirmReset({ token: 'a'.repeat(64), password: 'new-password-for-tests' }), { status: 429 });
});
test('authentication rejects tokens issued before a password reset', async t => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'password-reset-test-secret-with-over-32-characters';
  t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
  const user = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', sessionVersion: 1 };
  mock.method(User, 'findById', async () => user);
  const issue = v => jwt.sign({ v }, process.env.JWT_SECRET, { subject: user._id, algorithm: 'HS256', issuer: 'shopco-api', audience: 'shopco' });
  await assert.rejects(auth({ headers: { authorization: 'Bearer ' + issue(0) } }, {}, () => {}), { status: 401 });
  let called = false;
  await auth({ headers: { authorization: 'Bearer ' + issue(1) } }, {}, () => { called = true; });
  assert.equal(called, true);
});
