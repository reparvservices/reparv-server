import db from "../../config/dbconnect.js";

// eventController.js
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
    latitude,
    longitude,
    is_online,
    is_paid,
    ticket_price,
    total_seats,
  } = req.body;

  if (!title || !event_type || !event_date || !event_time) {
    return res.status(400).json({
      success: false,
      message: "title, event_type, event_date and event_time are required.",
    });
  }

  // const VALID_TYPES = [
  //   "Webinar",
  //   "Conference",
  //   "Training",
  //   "Launch",
  //   "Workshop",
  //   "Project Launch",
  //   "Site Visit",
  //   "Meeting",
  // ];

  // if (!VALID_TYPES.includes(event_type)) {
  //   return res.status(400).json({
  //     success: false,
  //     message: `event_type must be one of: ${VALID_TYPES.join(", ")}`,
  //   });
  // }

  console.log("createEvent called with:", req.body);
  const insertQuery = `
    INSERT INTO events
    (title, event_type, user_id, event_date, event_time, location, meeting_link,
     banner_url, description, latitude, longitude, is_online, is_paid,
     ticket_price, total_seats, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `;

  db.execute(
    insertQuery,
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
      latitude || null,
      longitude || null,
      is_online ? 1 : 0,
      is_paid ? 1 : 0,
      is_paid ? ticket_price || null : null,
      is_paid ? total_seats || null : null,
    ],
    (err, result) => {
      if (err) {
        console.error("createEvent error:", err);
        return res.status(500).json({
          success: false,
          message: "Internal server error.",
        });
      }

      const eventId = result.insertId;

      // ✅ Fetch inserted event
      db.execute(
        "SELECT * FROM events WHERE id = ?",
        [eventId],
        (err2, rows) => {
          if (err2) {
            console.error("fetch event error:", err2);
            return res.status(500).json({
              success: false,
              message: "Event created but fetch failed.",
            });
          }

          return res.status(201).json({
            success: true,
            message: "Event created successfully.",
            event: rows[0], // ✅ full inserted event
          });
        },
      );
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
    is_online,
    is_paid,
    ticket_price,
    total_seats,
  } = req.body;

  console.log("updateEvent called with:", req.body);
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
      is_online    = COALESCE(?, is_online),
      is_paid      = COALESCE(?, is_paid),
      ticket_price = COALESCE(?, ticket_price),
      total_seats  = COALESCE(?, total_seats),
      updated_at   = NOW()
    WHERE id = ?
  `;

  // For booleans, only pass a value if the field was explicitly sent
  const isOnlineVal = is_online !== undefined ? (is_online ? 1 : 0) : null;
  const isPaidVal = is_paid !== undefined ? (is_paid ? 1 : 0) : null;

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
      isOnlineVal,
      isPaidVal,
      ticket_price || null,
      total_seats || null,
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

  const VALID_STATUS = [
    "Active",
    "Inactive",
    "Draft",
    "Cancelled",
    "Completed",
  ];
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

// GET /event/analytics/:userId?days=30
export const getAnalytics = (req, res) => {
  const { userId } = req.params;
  const days = parseInt(req.query.days, 10); // 0 = all time, omitted = all time
  const useFilter = days > 0;

  // SQL fragment injected into each query when a period is requested
  const dateFilter = useFilter
    ? `AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`
    : "";

  const queries = {
    // ── KPI totals (period-filtered) ────────────────────────────────────────
    kpi: `
      SELECT
        COUNT(*)                                              AS total_events,
        COALESCE(SUM(view_count), 0)                          AS total_views,
        COALESCE(SUM(registration_count), 0)                  AS total_registrations,
        COALESCE(SUM(click_count), 0)                         AS total_clicks,
        COALESCE(SUM(tickets_sold), 0)                        AS total_tickets_sold,
        COALESCE(SUM(revenue), 0)                             AS total_revenue,
        ROUND(SUM(revenue) / NULLIF(SUM(tickets_sold), 0), 0) AS avg_ticket_price,
        COUNT(CASE WHEN status = 'Active'    THEN 1 END)      AS active_events,
        COUNT(CASE WHEN status = 'Draft'     THEN 1 END)      AS draft_events,
        COUNT(CASE WHEN status = 'Inactive'  THEN 1 END)      AS inactive_events,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)      AS cancelled_events
      FROM events
      WHERE user_id = ? ${dateFilter}`,

    // ── All-time ticket total (no date filter, always returned) ─────────────
    allTimeTickets: `
      SELECT COALESCE(SUM(tickets_sold), 0) AS total
      FROM events
      WHERE user_id = ?`,

    // ── Top 5 events by revenue then views ──────────────────────────────────
    topEvents: `
      SELECT
        id, title, event_type, status,
        view_count, registration_count,
        COALESCE(tickets_sold, 0) AS tickets_sold,
        COALESCE(revenue, 0)      AS revenue,
        event_date, banner_url
      FROM events
      WHERE user_id = ? ${dateFilter}
      ORDER BY revenue DESC, view_count DESC
      LIMIT 5`,

    // ── Monthly breakdown for chart (grouped by calendar month) ─────────────
    monthly: `
      SELECT
        DATE_FORMAT(event_date, '%b')         AS month,
        COUNT(*)                               AS count,
        COALESCE(SUM(view_count), 0)           AS views,
        COALESCE(SUM(tickets_sold), 0)         AS tickets,
        COALESCE(SUM(revenue), 0)              AS revenue
      FROM events
      WHERE user_id = ? ${dateFilter}
        AND event_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(event_date, '%Y-%m')
      ORDER BY MIN(event_date) ASC`,

    // ── Event type breakdown ─────────────────────────────────────────────────
    byType: `
      SELECT event_type, COUNT(*) AS count
      FROM events
      WHERE user_id = ? ${dateFilter}
      GROUP BY event_type`,

    // ── Status breakdown ─────────────────────────────────────────────────────
    byStatus: `
      SELECT status, COUNT(*) AS count
      FROM events
      WHERE user_id = ? ${dateFilter}
      GROUP BY status`,
  };

  const run = (sql, params = [userId]) =>
    new Promise((resolve, reject) => {
      db.execute(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

  Promise.all([
    run(queries.kpi),
    run(queries.allTimeTickets, [userId]), // always unfiltered
    run(queries.topEvents),
    run(queries.monthly),
    run(queries.byType),
    run(queries.byStatus),
  ])
    .then(([kpi, allTimeTickets, topEvents, monthly, byType, byStatus]) => {
      const kpiRow = kpi[0];

      res.json({
        success: true,
        data: {
          kpi: {
            ...kpiRow,
            // period-filtered ticket count is already in total_tickets_sold
            // expose all-time ticket count separately for the UI if needed
            all_time_tickets_sold: Number(allTimeTickets[0]?.total ?? 0),
          },
          topEvents,
          monthly,
          byType,
          byStatus,
        },
      });
    })
    .catch((err) => {
      console.error("getAnalytics error:", err);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    });
};

// ── Single Event Analytics ─────────────────────────────────────────────────
export const getEventAnalytics = (req, res) => {
  const { eventId } = req.params;

  const run = (sql, params) =>
    new Promise((resolve, reject) =>
      db.execute(sql, params, (err, rows) =>
        err ? reject(err) : resolve(rows),
      ),
    );

  Promise.all([
    // Core event row
    run(
      `SELECT id, title, event_type, status, banner_url, event_date, event_time,
              location, meeting_link, is_online, is_paid, ticket_price,
              COALESCE(view_count, 0)          AS view_count,
              COALESCE(registration_count, 0)  AS registration_count,
              COALESCE(click_count, 0)         AS click_count,
              COALESCE(tickets_sold, 0)        AS tickets_sold,
              COALESCE(revenue, 0)             AS revenue,
              total_seats,
              created_at
       FROM events WHERE id = ?`,
      [eventId],
    ),

    // Owner's average KPIs across ALL their events (for benchmark)
    run(
      `SELECT
         ROUND(AVG(view_count), 0)         AS avg_views,
         ROUND(AVG(tickets_sold), 0)       AS avg_tickets,
         ROUND(AVG(revenue), 0)            AS avg_revenue
       FROM events
       WHERE user_id = (SELECT user_id FROM events WHERE id = ?)
         AND id != ?`,
      [eventId, eventId],
    ),

    // Daily view_count increments for sparkline (last 30 days via created_at proxy)
    // If you track daily stats in a separate table replace this with that query.
    // For now we return the single aggregate so the UI can show a snapshot card.
    run(
      `SELECT
         DATE_FORMAT(created_at, '%d %b') AS day,
         view_count, tickets_sold, revenue
       FROM events WHERE id = ?`,
      [eventId],
    ),
  ])
    .then(([eventRows, benchRows, snapshot]) => {
      if (!eventRows.length)
        return res
          .status(404)
          .json({ success: false, message: "Event not found." });

      const ev = eventRows[0];
      const bench = benchRows[0] || {};

      const views = Number(ev.view_count);
      const tickets = Number(ev.tickets_sold);
      const revenue = Number(ev.revenue);

      // Conversion & fill rates
      const convRate = views > 0 ? ((tickets / views) * 100).toFixed(1) : "0.0";
      const seatFillRate =
        ev.total_seats > 0
          ? ((tickets / ev.total_seats) * 100).toFixed(1)
          : null;

      // vs benchmark (% delta)
      const delta = (key) => {
        const bench_val = Number(bench[`avg_${key}`]) || 0;
        if (bench_val === 0) return null;
        return (((Number(ev[key]) - bench_val) / bench_val) * 100).toFixed(1);
      };

      res.json({
        success: true,
        data: {
          event: ev,
          kpi: {
            view_count: views,
            registration_count: Number(ev.registration_count),
            click_count: Number(ev.click_count),
            tickets_sold: tickets,
            revenue,
            avg_ticket_price: ev.ticket_price
              ? Number(ev.ticket_price).toFixed(2)
              : null,
            total_seats: ev.total_seats,
            seat_fill_rate: seatFillRate,
            conv_rate: convRate,
          },
          benchmark: {
            avg_views: Number(bench.avg_views || 0),
            avg_tickets: Number(bench.avg_tickets || 0),
            avg_revenue: Number(bench.avg_revenue || 0),
            delta_views: delta("view_count"),
            delta_tickets: delta("tickets_sold"),
            delta_revenue: delta("revenue"),
          },
        },
      });
    })
    .catch((err) => {
      console.error("getEventAnalytics error:", err);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    });
};
