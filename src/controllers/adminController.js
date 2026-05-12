const supabase = require('../config/supabase');

// ─── Get All Tickets with Logs (Admin) ───
const getAllTicketsAdmin = async (req, res) => {
  try {
    // Fetch all tickets with category name
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_code,
        subject,
        description,
        status,
        priority,
        assigned_to,
        submitter_email,
        is_anonymous,
        resolution_notes,
        created_at,
        updated_at,
        categories ( name )
      `)
      .order('created_at', { ascending: false });

    if (ticketsError) throw ticketsError;

    // Fetch logs for each ticket
    const ticketIds = tickets.map(t => t.id);
    let logsMap = {};

    if (ticketIds.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from('ticket_logs')
        .select('*')
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: true });

      if (!logsError && logs) {
        logs.forEach(log => {
          if (!logsMap[log.ticket_id]) logsMap[log.ticket_id] = [];
          logsMap[log.ticket_id].push(log);
        });
      }
    }

    // Attach logs as history to each ticket
    const enriched = tickets.map(t => ({
      ...t,
      history: (logsMap[t.id] || []).map(log => ({
        action: log.action,
        details: log.remarks || null,
        date: log.created_at,
        performedBy: log.performed_by || 'system'
      }))
    }));

    return res.status(200).json({
      success: true,
      total: enriched.length,
      tickets: enriched
    });

  } catch (err) {
    console.error('getAllTicketsAdmin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Get All Staff (for Assign Dropdown) ───
const getAllStaff = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      total: data.length,
      staff: data
    });

  } catch (err) {
    console.error('getAllStaff error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Update Ticket (Assign + Status + Priority + Resolution Notes) ───
const updateTicketAdmin = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { assigned_to, status, priority, resolution_notes } = req.body;

    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // ─── Capitalize priority to match DB convention (Normal/High/Urgent) ───
    const capitalizePriority = (p) => {
      if (!p) return null;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    };

    // Build update payload (only include fields that were sent)
    const updatePayload = { updated_at: new Date().toISOString() };
    if (assigned_to !== undefined) updatePayload.assigned_to = assigned_to || null;
    if (status) updatePayload.status = status;
    if (priority) updatePayload.priority = capitalizePriority(priority);
    if (resolution_notes !== undefined) updatePayload.resolution_notes = resolution_notes || null;

    const { data, error } = await supabase
      .from('tickets')
      .update(updatePayload)
      .eq('id', ticket_id)
      .select()
      .single();

    // ─── Separate Supabase DB errors from "not found" ───
    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update ticket in database.'
      });
    }

    if (!data) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    // ─── Log the action ───
    const logRemarks = [];
    if (assigned_to) logRemarks.push(`Assigned to: ${assigned_to}`);
    if (status) logRemarks.push(`Status: ${status}`);
    if (priority) logRemarks.push(`Priority: ${priority}`);
    if (resolution_notes) logRemarks.push(`Notes: ${resolution_notes}`);

    await supabase.from('ticket_logs').insert([{
      ticket_id: data.id,
      action: 'Ticket Updated by Admin',
      remarks: logRemarks.join(' | ') || 'Ticket updated.',
      performed_by: req.staff?.email || 'admin'
    }]);

    return res.status(200).json({
      success: true,
      message: 'Ticket updated successfully!',
      ticket: data
    });

  } catch (err) {
    console.error('updateTicketAdmin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Get Reports Data (All Tickets + Summary Stats) ───
const getReports = async (req, res) => {
  try {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_code,
        subject,
        description,
        status,
        priority,
        assigned_to,
        submitter_email,
        resolution_notes,
        created_at,
        updated_at,
        categories ( name )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!tickets) throw new Error('No tickets found.');

    // ─── Fetch logs for each ticket ───
    const ticketIds = tickets.map(t => t.id);
    let logsMap = {};

    if (ticketIds.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from('ticket_logs')
        .select('*')
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: true });

      if (!logsError && logs) {
        logs.forEach(log => {
          if (!logsMap[log.ticket_id]) logsMap[log.ticket_id] = [];
          logsMap[log.ticket_id].push(log);
        });
      }
    }

    // ─── Attach logs as history to each ticket ───
    const enriched = tickets.map(t => ({
      ...t,
      history: (logsMap[t.id] || []).map(log => ({
        action: log.action,
        details: log.remarks || null,
        date: log.created_at,
        performedBy: log.performed_by || 'system'
      }))
    }));

    // ─── Compute summary stats ───
    const stats = {
      total: enriched.length,
      inProgress: enriched.filter(t => t.status === 'In Progress').length,
      pending: enriched.filter(t => t.status === 'Open').length,
      resolved: enriched.filter(t => t.status === 'Resolved' || t.status === 'Closed').length,
    };

    return res.status(200).json({
      success: true,
      stats,
      tickets: enriched
    });

  } catch (err) {
    console.error('getReports error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Get All Staff for User Management ───
const getUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, full_name, email, role, is_active, created_at')
      .order('full_name', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ success: true, total: data.length, users: data });
  } catch (err) {
    console.error('getUsers error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Add New Staff User ───
const addUser = async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { full_name, email, role, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, message: 'full_name, email, and password are required.' });
    }

    // Check duplicate email
    const { data: existing } = await supabase.from('staff').select('id').eq('email', email).single();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('staff')
      .insert([{ full_name, email, password: hashedPassword, role: role || 'staff', is_active: true }])
      .select('id, full_name, email, role, is_active, created_at')
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, message: 'User added successfully!', user: data });
  } catch (err) {
    console.error('addUser error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Server error. Please try again.' });
  }
};

// ─── Update Staff User ───
const updateUser = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { full_name, email, role } = req.body;

    const updatePayload = {};
    if (full_name) updatePayload.full_name = full_name;
    if (email) updatePayload.email = email;
    if (role) updatePayload.role = role;

    const { data, error } = await supabase
      .from('staff')
      .update(updatePayload)
      .eq('id', user_id)
      .select('id, full_name, email, role, is_active, created_at')
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
    if (!data) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({ success: true, message: 'User updated successfully!', user: data });
  } catch (err) {
    console.error('updateUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Deactivate (Soft Delete) Staff User ───
const deactivateUser = async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from('staff')
      .update({ is_active: false })
      .eq('id', user_id)
      .select('id, full_name')
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
    if (!data) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({ success: true, message: `"${data.full_name}" has been deactivated.` });
  } catch (err) {
    console.error('deactivateUser error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

module.exports = {
  getAllTicketsAdmin,
  getAllStaff,
  updateTicketAdmin,
  getReports,
  getUsers,
  addUser,
  updateUser,
  deactivateUser
};
