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
  } = req.body;

  console.log("createEvent request body:", req.body);
  // ── Validation ─────────────────────────
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

  // ── Insert ─────────────────────────
  const query = `
    INSERT INTO events
    (title, event_type,user_id, event_date, event_time, location, meeting_link, banner_url, description, status)
    VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, 'published')
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
    ],
    (err, result) => {
      if (err) {
        console.error("createEvent error:", err);
        return res.status(500).json({
          success: false,
          message: "Internal server error.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Event created successfully.",
        eventId: result.insertId,
      });
    },
  );
};

// GET /api/events
export const getEvents = (req, res) => {
  const id = req.params.id;
  const query =
    "SELECT * FROM events where user_id = ? ORDER BY created_at DESC";

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
