// controllers/scheduleNotesController.js

import db from "#db";

// ─── GET ALL (by projectPartnerId) ──────────────────────────────
export const getAllNotes = (req, res) => {
  const { projectPartnerId } = req.query;

  if (!projectPartnerId) {
    return res
      .status(400)
      .json({ success: false, message: "projectPartnerId is required" });
  }

  const sql = `
    SELECT * FROM schedule_notes
    WHERE project_partner_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [projectPartnerId], (err, results) => {
    if (err) {
      console.error("GET NOTES ERROR:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }
    return res.status(200).json(results);
  });
};

// ─── ADD EVENT / NOTE ───────────────────────────────────────────
export const addNote = (req, res) => {
  const {
    projectPartnerId,
    scheduleId,
    scheduleType,
    note,
    title,
    eventType,
    priority,
    eventDate,
    startTime,
    endTime,
    isAllDay,
    reminder,
    location,
    assignedTo,
    assignedRole, // ── added
    attachment,
    userId,
  } = req.body;

  if (!projectPartnerId) {
    return res
      .status(400)
      .json({ success: false, message: "projectPartnerId is required" });
  }

  console.log(req.body);

  const sql = `
    INSERT INTO schedule_notes (
      schedule_id, schedule_type, note,
      title, event_type, priority,
      event_date, start_time, end_time, is_all_day,
      reminder, location, assigned_to, assigned_role, attachment,
      project_partner_id, user_id,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const values = [
    scheduleId || null, // schedule_id
    scheduleType || null, // schedule_type
    note || null, // note
    title || null, // title
    eventType || null, // event_type
    priority || null, // priority
    eventDate || null, // event_date
    startTime || null, // start_time
    endTime || null, // end_time
    isAllDay ? 1 : 0, // is_all_day
    reminder || null, // reminder
    location || null, // location
    assignedTo || null, // assigned_to
    assignedRole || null, // assigned_role  ── added
    attachment || null, // attachment
    projectPartnerId, // project_partner_id
    userId || null, // user_id
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("ADD NOTE ERROR:", err);
      return res.status(500).json({ success: false, message: "Insert failed" });
    }
    return res.status(201).json({
      success: true,
      message: "Event added successfully",
      id: result.insertId,
    });
  });
};

// ─── UPDATE EVENT / NOTE ────────────────────────────────────────
export const updateNote = (req, res) => {
  const { id } = req.params;
  const {
    note,
    title,
    eventType,
    priority,
    eventDate,
    startTime,
    endTime,
    isAllDay,
    reminder,
    location,
    assignedTo,
    attachment,
  } = req.body;

  const sql = `
    UPDATE schedule_notes SET
      note        = ?,
      title       = ?,
      event_type  = ?,
      priority    = ?,
      event_date  = ?,
      start_time  = ?,
      end_time    = ?,
      is_all_day  = ?,
      reminder    = ?,
      location    = ?,
      assigned_to = ?,
      attachment  = ?,
      updated_at  = NOW()
    WHERE id = ?
  `;

  const values = [
    note || null,
    title || null,
    eventType || null,
    priority || null,
    eventDate || null,
    startTime || null,
    endTime || null,
    isAllDay ? 1 : 0,
    reminder || null,
    location || null,
    assignedTo || null,
    attachment || null,
    id,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("UPDATE NOTE ERROR:", err);
      return res.status(500).json({ success: false, message: "Update failed" });
    }
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Event updated successfully" });
  });
};

// ─── DELETE ─────────────────────────────────────────────────────
export const deleteNote = (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: "id is required" });
  }

  db.query("DELETE FROM schedule_notes WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("DELETE NOTE ERROR:", err);
      return res.status(500).json({ success: false, message: "Delete failed" });
    }
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Event deleted successfully" });
  });
};
