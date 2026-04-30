const jwt = require('jsonwebtoken');

// ─── Verify Token ───
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.staff = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token. Please login again.'
    });
  }
};

// ─── Admin Only ───
const adminOnly = (req, res, next) => {
  if (req.staff.role !== 'admin' && req.staff.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  adminOnly
};