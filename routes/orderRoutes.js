const express = require('express');
const { auth } = require('../middleware/auth');
const { createOrder, listOrders, getOrder } = require('../controllers/orderController');

const router = express.Router();

router.post('/orders', auth, createOrder);
router.get('/orders', auth, listOrders);
router.get('/orders/:id', auth, getOrder);

module.exports = router;
