const express = require('express');
const { auth } = require('../middleware/auth');
const { createCheckout, checkoutStatus, cancelCheckout } = require('../controllers/paymentController');
const router = express.Router();
router.post('/checkout', auth, createCheckout);
router.get('/checkout/:id', auth, checkoutStatus);
router.post('/checkout/:id/cancel', auth, cancelCheckout);
module.exports = router;
