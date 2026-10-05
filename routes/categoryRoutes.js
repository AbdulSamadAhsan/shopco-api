const express = require('express');
const { list, get } = require('../controllers/categoryController');

const router = express.Router();

router.get('/', list);
router.get('/:id', get);

module.exports = router;
