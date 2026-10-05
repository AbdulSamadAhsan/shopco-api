const service = require('../services/userServices.js');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const registerUser = async (req, res) => ok(res, await service.createUser(req.body), 201);
const loginUser = async (req, res) => ok(res, await service.loginUser(req.body));
const currentUser = (req, res) => ok(res, service.publicUser(req.user));
async function registerReferenceUser(req, res) {
  const result = await service.createUser(req.body, 6);
  ok(res, result.user, 201, { message: 'User registered successfully', token: result.token });
}
async function loginReferenceUser(req, res) {
  const result = await service.loginUser(req.body);
  ok(res, result.user, 200, { message: 'Login successful', token: result.token });
}

module.exports = { registerUser, loginUser, currentUser, registerReferenceUser, loginReferenceUser };
