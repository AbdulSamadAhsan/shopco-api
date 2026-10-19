const express = require('express');
const { registerUser, loginUser, currentUser, updateCurrentUser, deleteCurrentUser } = require('../controllers/userController');
const { auth } = require('../middleware/auth');

const router = express.Router();
const { requestReset, confirmReset } = require('../controllers/passwordResetController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', requestReset);
router.post('/reset-password', confirmReset);
router.get('/me', auth, currentUser);
router.patch('/me', auth, updateCurrentUser);
router.delete('/me', auth, deleteCurrentUser);

module.exports = router;
