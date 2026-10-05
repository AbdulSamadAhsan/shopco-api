const express = require('express');
const { auth } = require('../middleware/auth');
const { listReviews, createReview } = require('../controllers/reviewController');

const router = express.Router();

router.get('/products/:id/reviews', listReviews);
router.post('/products/:id/reviews', auth, createReview);

module.exports = router;
