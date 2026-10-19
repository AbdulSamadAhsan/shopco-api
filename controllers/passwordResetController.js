const service = require('../services/passwordResetService');
const requestReset = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.requestReset(req.body, req.ip) });
};
const confirmReset = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await service.confirmReset(req.body, req.ip) });
};
module.exports = { requestReset, confirmReset };
