const express = require('express');
const { auth } = require('../middleware/auth');
const { getUserCart, putUserCart, deleteUserCart, getGuestCart, putGuestCart, checkoutQuote } = require('../controllers/cartController');

const router = express.Router();

router.get('/cart', auth, getUserCart);
router.put('/cart', auth, putUserCart);
router.delete('/cart', auth, deleteUserCart);
router.get('/guest-cart', getGuestCart);
router.put('/guest-cart', putGuestCart);
router.post('/checkout/quote', checkoutQuote);

module.exports = router;
