const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Register Staff (Admin only action) ───
const registerStaff = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    // ─── Validate fields ───
    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'full_name, email, and password are required.'
      });
    }

    // ─── Check if email already exists ───
    const { data: existing } = await supabase
      .from('staff')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered.'
      });
    }

    // ─── Hash the password ───
    const hashedPassword = await bcrypt.hash(password, 10);

    // ─── Insert new staff ───
    const { data, error } = await supabase
      .from('staff')
      .insert([{
        full_name,
        email,
        password: hashedPassword,
        role: role || 'staff'
      }])
      .select('id, full_name, email, role')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Staff registered successfully!',
      staff: data
    });

  } catch (err) {
    console.error('registerStaff error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Login Staff ───
const loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ─── Validate fields ───
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    // ─── Find staff by email ───
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error || !staff) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // ─── Compare password ───
    const isMatch = await bcrypt.compare(password, staff.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // ─── Generate JWT Token ───
    const token = jwt.sign(
      {
        id: staff.id,
        email: staff.email,
        role: staff.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${staff.full_name}!`,
      token,
      staff: {
        id: staff.id,
        full_name: staff.full_name,
        email: staff.email,
        role: staff.role
      }
    });

  } catch (err) {
    console.error('loginStaff error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Get Current Logged In Staff ───
const getMe = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, email, role, created_at')
      .eq('id', req.staff.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found.'
      });
    }

    return res.status(200).json({
      success: true,
      staff: data
    });

  } catch (err) {
    console.error('getMe error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

module.exports = {
  registerStaff,
  loginStaff,
  getMe
};