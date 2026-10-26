const express = require('express');
const { auth } = require('../middleware/auth');
const { checkoutOwner } = require('../middleware/checkoutOwner');
const { createOrder, listOrders, getOrder } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', checkoutOwner, createOrder);
router.get('/orders', auth, listOrders);
router.get('/orders/:id', auth, getOrder);

module.exports = router;
