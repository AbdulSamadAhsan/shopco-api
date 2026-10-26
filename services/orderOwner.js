const { createHash } = require('node:crypto');

function ownerFilter(owner) {
  if (owner && typeof owner === 'object' && /^[a-f0-9]{64}$/.test(owner.guestTokenHash || '')) {
    return { user: null, guestTokenHash: owner.guestTokenHash };
  }
  if (!owner || !/^[a-f0-9]{24}$/i.test(String(owner))) {
    throw Object.assign(new Error('A valid checkout owner is required'), { status: 400 });
  }
  return { user: owner };
}

function scopedKey(owner, key) {
  const filter = ownerFilter(owner);
  // Keep the existing unique user/key index safe for multiple account-free shoppers.
  return filter.guestTokenHash
    ? 'guest:' + createHash('sha256').update(filter.guestTokenHash + ':' + key).digest('hex')
    : key;
}

const paymentOwner = order => order.guestTokenHash ? 'guest:' + order.guestTokenHash : String(order.user);
module.exports = { ownerFilter, scopedKey, paymentOwner };
