const express = require('express');
const router = express.Router();
const {
  submitTicket,
  trackTicket,
  getAllTickets,
  updateTicketStatus,
  assignTicket,
  resolveTicket,
  getTicketLogs
} = require('../controllers/ticketController');
const {
  verifyToken,
  adminOnly
} = require('../middlewares/authMiddleware');

// ─── Public Routes (no login needed) ───
router.post('/submit', submitTicket);
router.get('/track/:ticket_code', trackTicket);

// ─── Staff Routes (need token) ───
router.get('/all', verifyToken, getAllTickets);
router.patch('/:ticket_id/status', verifyToken, updateTicketStatus);
router.patch('/:ticket_id/resolve', verifyToken, resolveTicket);
router.get('/:ticket_id/logs', verifyToken, getTicketLogs);

// ─── Admin Only Routes ───
router.patch('/:ticket_id/assign', verifyToken, adminOnly, assignTicket);

module.exports = router;