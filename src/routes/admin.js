const express = require('express');
const router = express.Router();
const {
  getAllTicketsAdmin,
  getAllStaff,
  updateTicketAdmin,
  getReports,
  getUsers,
  addUser,
  updateUser,
  deactivateUser
} = require('../controllers/adminController');
const { verifyToken, adminOnly } = require('../middlewares/authMiddleware');

// ─── Ticket Routes ───
router.get('/tickets', verifyToken, adminOnly, getAllTicketsAdmin);
router.get('/staff', verifyToken, adminOnly, getAllStaff);
router.get('/reports', verifyToken, adminOnly, getReports);
router.put('/tickets/:ticket_id', verifyToken, adminOnly, updateTicketAdmin);

// ─── User Management Routes ───
router.get('/users', verifyToken, adminOnly, getUsers);
router.post('/users', verifyToken, adminOnly, addUser);
router.put('/users/:user_id', verifyToken, adminOnly, updateUser);
router.delete('/users/:user_id', verifyToken, adminOnly, deactivateUser);

module.exports = router;
