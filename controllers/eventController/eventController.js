import db from "../../config/dbconnect.js";

// POST /api/events/create
export const createEvent = (req, res) => {
  const {
    title,
    user_id,
    event_type,
    event_date,
    event_time,
    location,
    meeting_link,
    banner_url,
    description,
    latitude, // ← ADD
    longitude, // ← ADD
  } = req.body;

  if (!title || !event_type || !event_date || !event_time) {
    return res.status(400).json({
      success: false,
      message: "title, event_type, event_date and event_time are required.",
    });
  }

  const VALID_TYPES = [
    "Webinar",
    "Conference",
    "Training",
    "Launch",
    "Workshop",
  ];
  if (!VALID_TYPES.includes(event_type)) {
    return res.status(400).json({
      success: false,
      message: `event_type must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }

  const query = `
    INSERT INTO events
    (title, event_type, user_id, event_date, event_time, location, meeting_link,
     banner_url, description, latitude, longitude, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `;

  db.execute(
    query,
    [
      title,
      event_type,
      user_id,
      event_date,
      event_time,
      location || null,
      meeting_link || null,
      banner_url || null,
      description || null,
      latitude || null, // ← ADD
      longitude || null, // ← ADD
    ],
    (err, result) => {
      if (err) {
        console.error("createEvent error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
      return res.status(201).json({
        success: true,
        message: "Event created successfully.",
        eventId: result.insertId,
      });
    },
  );
};

// GET user created /api/events
export const getEvents = (req, res) => {
  const id = req.params.id;

  const query = `
    SELECT 
      events.*, 
      eventUsers.fullName AS user_name,
      eventUsers.mobileNumber AS user_mobile,
      eventUsers.email AS user_email
    FROM events
    JOIN eventUsers 
      ON events.user_id = eventUsers.id
    WHERE events.user_id = ?
    ORDER BY events.created_at DESC
  `;

  db.execute(query, [id], (err, rows) => {
    if (err) {
      console.error("getEvents error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows,
    });
  });
};

export const getActiveEvents = (req, res) => {
  const query = `
    SELECT 
      events.*, 
      eventUsers.fullName AS user_name,
      eventUsers.mobileNumber AS user_mobile,
      eventUsers.email AS user_email
    FROM events
    JOIN eventUsers 
      ON events.user_id = eventUsers.id
    WHERE events.status = 'Active'
    ORDER BY events.created_at DESC
  `;
  console.log("Executing getActiveEvents query...");

  db.execute(query, [], (err, rows) => {
    if (err) {
      console.error("getActiveEvents error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows,
    });
  });
};

// Add these to eventController.js

// DELETE /event/:eventId
export const deleteEvent = (req, res) => {
  const { eventId } = req.params;

  db.execute(`DELETE FROM events WHERE id = ?`, [eventId], (err, result) => {
    if (err) {
      console.error("deleteEvent error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found." });
    }
    return res
      .status(200)
      .json({ success: true, message: "Event deleted successfully." });
  });
};

// PUT /event/:eventId
export const updateEvent = (req, res) => {
  const { eventId } = req.params;
  const {
    title,
    event_type,
    event_date,
    event_time,
    location,
    meeting_link,
    banner_url,
    description,
    latitude,
    longitude,
  } = req.body;

  const VALID_TYPES = [
    "Webinar",
    "Conference",
    "Training",
    "Launch",
    "Workshop",
  ];
  if (event_type && !VALID_TYPES.includes(event_type)) {
    return res.status(400).json({
      success: false,
      message: `event_type must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }

  const query = `
    UPDATE events SET
      title        = COALESCE(?, title),
      event_type   = COALESCE(?, event_type),
      event_date   = COALESCE(?, event_date),
      event_time   = COALESCE(?, event_time),
      location     = COALESCE(?, location),
      meeting_link = COALESCE(?, meeting_link),
      banner_url   = COALESCE(?, banner_url),
      description  = COALESCE(?, description),
      latitude     = COALESCE(?, latitude),
      longitude    = COALESCE(?, longitude),
      updated_at   = NOW()
    WHERE id = ?
  `;

  db.execute(
    query,
    [
      title || null,
      event_type || null,
      event_date || null,
      event_time || null,
      location || null,
      meeting_link || null,
      banner_url || null,
      description || null,
      latitude || null,
      longitude || null,
      eventId,
    ],
    (err, result) => {
      if (err) {
        console.error("updateEvent error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Event not found." });
      }
      return res
        .status(200)
        .json({ success: true, message: "Event updated successfully." });
    },
  );
};

// PATCH /event/:eventId/status
export const changeEventStatus = (req, res) => {
  const { eventId } = req.params;
  const { status } = req.body;

  const VALID_STATUS = ["Active", "Inactive", "Draft", "Cancelled"];
  if (!status || !VALID_STATUS.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${VALID_STATUS.join(", ")}`,
    });
  }

  db.execute(
    `UPDATE events SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, eventId],
    (err, result) => {
      if (err) {
        console.error("changeEventStatus error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Event not found." });
      }
      return res.status(200).json({
        success: true,
        message: `Event status changed to '${status}'.`,
      });
    },
  );
};
