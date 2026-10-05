const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    fail(503, 'Authentication is not configured');
  return process.env.JWT_SECRET;
}

module.exports = { secret };
