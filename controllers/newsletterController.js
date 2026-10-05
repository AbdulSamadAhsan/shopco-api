const { subscribe: saveSubscription } = require('../services/newsletterService.js');
const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const subscribe = async (req, res) => ok(res, await saveSubscription(req.body));

module.exports = { subscribe };
