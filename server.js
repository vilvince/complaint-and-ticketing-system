const express = require('express');
const cors = require('cors');
require('dotenv').config();

const ticketRoutes = require('./src/routes/tickets');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ───
app.use(cors());
app.use(express.json());

// ─── Routes ───
app.use('/api/tickets', ticketRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ─── Health Check ───
app.get('/', (req, res) => {
  res.json({
    message: '🎫 Ticketing System API is running!',
    status: 'OK'
  });
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});