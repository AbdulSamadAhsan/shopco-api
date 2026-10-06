const express = require('express');
const {pay} = require('../controllers/paymentController');
const router = express.Router();
router.post("pay",pay);
module.exports=router;