const express = require('express');
const { checkoutOwner } = require('../middleware/checkoutOwner');
const { createCheckout, checkoutStatus, cancelCheckout } = require('../controllers/paymentController');
const router = express.Router();
router.post('/checkout', checkoutOwner, createCheckout);
router.get('/checkout/:id', checkoutOwner, checkoutStatus);
router.post('/checkout/:id/cancel', checkoutOwner, cancelCheckout);
module.exports = router;
