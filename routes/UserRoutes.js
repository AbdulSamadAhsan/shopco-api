const express = require('express');
const { registerReferenceUser, loginReferenceUser } = require('../controllers/userController');

const router = express.Router();

router.post('/register', registerReferenceUser);
router.post('/login', loginReferenceUser);

module.exports = router;
