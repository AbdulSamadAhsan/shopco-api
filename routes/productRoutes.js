const express = require('express');
const { list, filters, categories, brands, get, create } = require('../controllers/productController');

const router = express.Router();

router.get('/', list);
router.post('/', create);
router.get('/filters', filters);
router.get('/categories', categories);
router.get('/brands', brands);
router.get('/:id', get);

module.exports = router;
