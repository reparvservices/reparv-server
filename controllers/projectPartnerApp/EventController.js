// controllers/scheduleNotesController.js

import db from "../../config/dbconnect.js";

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
      reminder, location, assigned_to, attachment,
      project_partner_id, user_id,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const values = [
    projectPartnerId || null,
    scheduleType || null,
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
    projectPartnerId,
    userId || null,
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
