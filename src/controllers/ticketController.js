const supabase = require('../config/supabase');
const { nanoid } = require('nanoid');

// ─── Generate Ticket Code ───
const generateTicketCode = () => {
  const year = new Date().getFullYear();
  const unique = nanoid(6).toUpperCase();
  return `TKT-${year}-${unique}`;
};

// ─── Submit Ticket (Guest or Registered) ───
const submitTicket = async (req, res) => {
  try {
    const { category_id, subject, description, submitter_email } = req.body;

    // ─── Validate required fields ───
    if (!category_id || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'category_id, subject, and description are required.'
      });
    }

    const ticket_code = generateTicketCode();

    // ─── Insert into Supabase ───
    const { data, error } = await supabase
      .from('tickets')
      .insert([{
        ticket_code,
        category_id,
        subject,
        description,
        submitter_email: submitter_email || null,
        is_anonymous: true,
        status: 'Open'
      }])
      .select()
      .single();

    if (error) throw error;

    // ─── Log the action ───
    await supabase.from('ticket_logs').insert([{
      ticket_id: data.id,
      action: 'Ticket Submitted',
      remarks: 'New ticket submitted via Guest submission.',
      performed_by: 'system'
    }]);

    return res.status(201).json({
      success: true,
      message: 'Ticket submitted successfully!',
      ticket_code: data.ticket_code,
      ticket_id: data.id,
      status: data.status
    });

  } catch (err) {
    console.error('submitTicket error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Track Ticket by Code ───
const trackTicket = async (req, res) => {
  try {
    const { ticket_code } = req.params;

    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id,
        ticket_code,
        subject,
        status,
        priority,
        assigned_to,
        resolution_notes,
        created_at,
        updated_at,
        categories ( name )
      `)
      .eq('ticket_code', ticket_code)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found. Please check your ticket code.'
      });
    }

    // ─── Fetch activity logs for this ticket ───
    const { data: logs } = await supabase
      .from('ticket_logs')
      .select('action, remarks, performed_by, created_at')
      .eq('ticket_id', data.id)
      .order('created_at', { ascending: true });

    const history = (logs || []).map(log => ({
      action: log.action,
      details: log.remarks || null,
      performedBy: log.performed_by || 'system',
      date: log.created_at,
    }));

    // Return ticket without exposing internal id
    const { id: _id, ...ticketPublic } = data;

    return res.status(200).json({
      success: true,
      ticket: { ...ticketPublic, history }
    });

  } catch (err) {
    console.error('trackTicket error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};


// ─── Get Tickets (filtered by assigned_to for staff, all for admin) ───
const getAllTickets = async (req, res) => {
  try {
    const { role, full_name } = req.staff || {};
    const userRole = (role || '').toLowerCase();

    console.log(`Fetching tickets for: ${full_name} (${role})`);

    let query = supabase
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
        is_anonymous,
        created_at,
        updated_at,
        categories ( name )
      `)
      .order('created_at', { ascending: false });

    // Staff only see their own assigned tickets
    if (userRole === 'staff' && full_name) {
      console.log(`Applying filter: assigned_to = ${full_name}`);
      query = query.eq('assigned_to', full_name);
    }

    const { data: tickets, error } = await query;
    if (error) throw error;
    if (!tickets) return res.status(200).json({ success: true, total: 0, tickets: [] });

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

    return res.status(200).json({
      success: true,
      total: enriched.length,
      tickets: enriched
    });

  } catch (err) {
    console.error('getAllTickets error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Get Logs for tickets assigned to this staff (History Log tab) ───
const getMyLogs = async (req, res) => {
  try {
    const { full_name } = req.staff || {};

    // Get ticket IDs assigned to this staff member
    const { data: myTickets, error: tErr } = await supabase
      .from('tickets')
      .select('id')
      .eq('assigned_to', full_name);

    if (tErr) throw tErr;

    if (!myTickets || myTickets.length === 0) {
      return res.status(200).json({ success: true, logs: [] });
    }

    const ticketIds = myTickets.map(t => t.id);

    const { data: logs, error: lErr } = await supabase
      .from('ticket_logs')
      .select('id, ticket_id, action, remarks, performed_by, created_at, tickets ( ticket_code, subject )')
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: false });

    if (lErr) throw lErr;

    const mapped = (logs || []).map(log => ({
      id: log.id,
      action: log.action,
      details: log.remarks || '',
      ticketCode: log.tickets?.ticket_code || '',
      subject: log.tickets?.subject || '',
      date: log.created_at,
      performedBy: log.performed_by || 'system',
    }));

    return res.status(200).json({ success: true, logs: mapped });

  } catch (err) {
    console.error('getMyLogs error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─── Update Ticket Status ───
const updateTicketStatus = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { status, remarks, performed_by } = req.body;

    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // ─── Update ticket ───
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status,
        updated_at: new Date()
      })
      .eq('id', ticket_id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // ─── Log the action ───
    await supabase.from('ticket_logs').insert([{
      ticket_id: data.id,
      action: `Status updated to: ${status}`,
      remarks: remarks || null,
      performed_by: performed_by || 'staff'
    }]);

    return res.status(200).json({
      success: true,
      message: `Ticket status updated to "${status}" successfully!`,
      ticket: data
    });

  } catch (err) {
    console.error('updateTicketStatus error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Assign Ticket to Staff ───
const assignTicket = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { assigned_to, priority } = req.body;

    if (!assigned_to) {
      return res.status(400).json({
        success: false,
        message: 'assigned_to is required.'
      });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to,
        priority: priority || 'Normal',
        status: 'In Progress',
        updated_at: new Date()
      })
      .eq('id', ticket_id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // ─── Log the action ───
    await supabase.from('ticket_logs').insert([{
      ticket_id: data.id,
      action: `Ticket assigned to: ${assigned_to}`,
      remarks: `Priority set to: ${priority || 'Normal'}`,
      performed_by: 'admin'
    }]);

    return res.status(200).json({
      success: true,
      message: `Ticket assigned to "${assigned_to}" successfully!`,
      ticket: data
    });

  } catch (err) {
    console.error('assignTicket error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Resolve Ticket ───
const resolveTicket = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { resolution_notes, performed_by } = req.body;

    if (!resolution_notes) {
      return res.status(400).json({
        success: false,
        message: 'resolution_notes is required.'
      });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: 'Resolved',
        resolution_notes,
        updated_at: new Date()
      })
      .eq('id', ticket_id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found.'
      });
    }

    // ─── Log the action ───
    await supabase.from('ticket_logs').insert([{
      ticket_id: data.id,
      action: 'Ticket Resolved',
      remarks: resolution_notes,
      performed_by: performed_by || 'staff'
    }]);

    return res.status(200).json({
      success: true,
      message: 'Ticket resolved successfully!',
      ticket: data
    });

  } catch (err) {
    console.error('resolveTicket error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

// ─── Get Ticket Logs ───
const getTicketLogs = async (req, res) => {
  try {
    const { ticket_id } = req.params;

    const { data, error } = await supabase
      .from('ticket_logs')
      .select('*')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      total: data.length,
      logs: data
    });

  } catch (err) {
    console.error('getTicketLogs error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
};

module.exports = {
  submitTicket,
  trackTicket,
  getAllTickets,
  updateTicketStatus,
  assignTicket,
  resolveTicket,
  getTicketLogs,
  getMyLogs
};