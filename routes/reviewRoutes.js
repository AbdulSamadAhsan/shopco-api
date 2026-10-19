const express = require('express');
const { auth } = require('../middleware/auth');
const { listReviews, createReview, myReviews } = require('../controllers/reviewController');

const router = express.Router();

router.get('/products/:id/reviews', listReviews);
router.get('/reviews/mine', auth, myReviews);
router.post('/products/:id/reviews', auth, createReview);

module.exports = router;
