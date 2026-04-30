const express = require('express');
const router = express.Router();
const {
  registerStaff,
  loginStaff,
  getMe
} = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

// ─── Public Routes ───
router.post('/register', registerStaff);
router.post('/login', loginStaff);

// ─── Protected Routes (need token) ───
router.get('/me', verifyToken, getMe);

module.exports = router;