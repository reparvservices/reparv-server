import Razorpay from "razorpay";
import db from "#db";
import { sendBookingConfirmationEmail } from "#utils/sendTicketEmail.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const generateBookingRef = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `#RPV-${ts}${rand}`.slice(0, 14);
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, event_id } = req.body;
    if (!amount || !event_id) {
      return res
        .status(400)
        .json({ success: false, message: "amount and event_id required" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `rparv_${event_id}_${Date.now()}`,
      notes: { event_id: String(event_id) },
    });

    return res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("[createOrder]", err);
    return res
      .status(500)
      .json({ success: false, message: "Order creation failed" });
  }
};

const ROLE_TABLE_MAP = {
  project: { table: "projectpartner", idColumn: "id" },
  territory: { table: "territorypartner", idColumn: "id" },
  sales: { table: "salespersons", idColumn: "salespersonsid" },
};

export const createBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      event_id,
      ticket_count = 1,
      ticket_type = "General",
      attendee_name,
      attendee_email,
      attendee_mobile,
      payment_id,
      payment_method = "free",
      role,
    } = req.body;

    if (!event_id) {
      return res
        .status(400)
        .json({ success: false, message: "event_id is required" });
    }

    if (!role) {
      return res
        .status(400)
        .json({ success: false, message: "role is required" });
    }

    const roleConfig = ROLE_TABLE_MAP[role];
    if (!roleConfig) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be project | territory | sales",
      });
    }

    const { table, idColumn } = roleConfig;
    const [[userRow]] = await db
      .promise()
      .query(
        `SELECT ${idColumn} AS user_id FROM ${table} WHERE ${idColumn} = ? LIMIT 1`,
        [id],
      );

    if (!userRow) {
      return res.status(404).json({
        success: false,
        message: `No ${role} partner found with id ${id}`,
      });
    }

    const user_id = userRow.user_id;

    const [[event]] = await db
      .promise()
      .query(`SELECT * FROM events WHERE id = ?`, [event_id]);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    if (event.status !== "Active") {
      return res
        .status(400)
        .json({ success: false, message: "Event is not active" });
    }

    if (event.total_seats !== null) {
      const remaining = event.total_seats - (event.tickets_sold || 0);
      if (remaining < ticket_count) {
        return res.status(400).json({
          success: false,
          message: `Only ${remaining} seat(s) remaining`,
        });
      }
    }

    let payment_status = "free";
    let resolved_payment_method = payment_method;
    let verified_amount_paid = 0;

    if (event.is_paid === 1) {
      if (!payment_id) {
        return res.status(400).json({
          success: false,
          message: "payment_id is required for paid events",
        });
      }

      const payment = await razorpay.payments.fetch(payment_id);
      const expectedAmount = Math.round(event.ticket_price * 100);

      if (payment.amount !== expectedAmount) {
        return res.status(400).json({
          success: false,
          message: `Payment amount mismatch. Expected Rs ${expectedAmount / 100}, got Rs ${payment.amount / 100}`,
        });
      }

      if (!payment.captured) {
        const capture = await razorpay.payments.capture(
          payment_id,
          expectedAmount,
          "INR",
        );
        if (capture.status !== "captured") {
          return res
            .status(400)
            .json({ success: false, message: "Payment capture failed" });
        }
      }

      payment_status = "paid";
      resolved_payment_method = "razorpay";
      verified_amount_paid = payment.amount / 100;
    }

    const [[existing]] = await db.promise().query(
      `SELECT id, booking_ref FROM booked_tickets
       WHERE user_id = ? AND role = ? AND event_id = ? AND status != 'cancelled'`,
      [user_id, role, event_id],
    );

    let booking_id;
    let booking_ref;
    const final_amount = event.is_paid === 1 ? verified_amount_paid : 0;

    if (existing) {
      await db.promise().query(
        `UPDATE booked_tickets
         SET ticket_count    = ticket_count + ?,
             amount_paid     = amount_paid + ?,
             payment_id      = ?,
             payment_method  = ?,
             payment_status  = ?,
             attendee_name   = ?,
             attendee_email  = ?,
             attendee_mobile = ?,
             ticket_type     = ?,
             updated_at      = NOW()
         WHERE id = ?`,
        [
          ticket_count,
          final_amount,
          payment_id ?? null,
          resolved_payment_method,
          payment_status,
          attendee_name,
          attendee_email ?? null,
          attendee_mobile ?? null,
          ticket_type,
          existing.id,
        ],
      );

      booking_id = existing.id;
      booking_ref = existing.booking_ref;
    } else {
      booking_ref = generateBookingRef();
      const qr_data = JSON.stringify({
        booking_ref,
        event_id,
        user_id,
        role,
        ticket_count,
        ticket_type,
      });

      const [insertResult] = await db.promise().query(
        `INSERT INTO booked_tickets
           (booking_ref, user_id, role, event_id,
            attendee_name, attendee_email, attendee_mobile,
            ticket_type, ticket_count,
            amount_paid, payment_method, payment_id, payment_status,
            status, qr_data,
            created_at, updated_at)
         VALUES
           (?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            'active', ?,
            NOW(), NOW())`,
        [
          booking_ref,
          user_id,
          role,
          event_id,
          attendee_name,
          attendee_email ?? null,
          attendee_mobile ?? null,
          ticket_type,
          ticket_count,
          final_amount,
          resolved_payment_method,
          payment_id ?? null,
          payment_status,
          qr_data,
        ],
      );

      booking_id = insertResult.insertId;
    }

    await db
      .promise()
      .query(
        `UPDATE events SET tickets_sold = COALESCE(tickets_sold, 0) + ? WHERE id = ?`,
        [ticket_count, event_id],
      );

    if (attendee_email) {
      const eventTime = event.start_time
        ? `${event.start_time}${event.end_time ? " to " + event.end_time : ""}`
        : "See event details";

      const venue = event.is_online
        ? "Online Event"
        : [event.venue_name, event.venue_address].filter(Boolean).join(", ") ||
          "TBA";

      sendBookingConfirmationEmail({
        name: attendee_name,
        email: attendee_email,
        mobile: attendee_mobile ?? null,
        eventTitle: event.title,
        eventDate: event.event_date,
        eventTime,
        venue,
        ticketCount: ticket_count,
        ticketType: ticket_type,
        ticketPrice: event.ticket_price ?? 0,
        amountPaid: final_amount,
        bookingRef: booking_ref,
        bookingId: booking_id,
        paymentId: payment_id ?? null,
        paymentMethod: resolved_payment_method,
        paymentStatus: payment_status,
        bookedAt: new Date().toISOString(),
        orgName: "Reparv Events",
      });
    }

    return res.status(201).json({
      success: true,
      message: existing
        ? "Tickets added to existing booking"
        : "Booking confirmed",
      booking_id,
      booking_ref,
    });
  } catch (err) {
    console.error("Booking Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMyBookings = (req, res) => {
  const user_id = req.params.user_id;
  const { role, status, page = 1, limit = 20 } = req.query;

  if (!role) {
    return res.status(400).json({
      success: false,
      message: "role query param is required (project | sales | territory)",
    });
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let whereClause = "WHERE bt.user_id = ? AND bt.role = ?";
  const params = [user_id, role];

  if (status) {
    whereClause += " AND bt.status = ?";
    params.push(status.toLowerCase());
  }

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM booked_tickets bt
    ${whereClause}
  `;

  db.query(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Server error (count)",
        error: err.message,
      });
    }

    const total = countResult?.[0]?.total || 0;
    const fetchQuery = `
      SELECT
        bt.*,
        e.title AS event_title,
        e.event_type,
        e.event_date,
        e.event_time,
        e.start_time,
        e.end_time,
        e.location,
        e.meeting_link,
        e.banner_url,
        e.is_online,
        e.is_paid,
        e.ticket_price,
        e.total_seats
      FROM booked_tickets bt
      JOIN events e ON bt.event_id = e.id
      ${whereClause}
      ORDER BY bt.created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.query(fetchQuery, [...params, limitNum, offset], (err2, bookings) => {
      if (err2) {
        return res.status(500).json({
          success: false,
          message: "Server error (fetch)",
          error: err2.message,
        });
      }

      return res.status(200).json({
        success: true,
        data: bookings || [],
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    });
  });
};

export const getBookingById = (req, res) => {
  const user_id = req.params.user_id || req.user?.id;
  const booking_id = req.params.id;

  db.query(
    `SELECT bt.*, e.title AS event_title
     FROM booked_tickets bt
     JOIN events e ON bt.event_id = e.id
     WHERE bt.id = ? AND bt.user_id = ?`,
    [booking_id, user_id],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Server error",
          error: err.message,
        });
      }

      if (!results || results.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Booking not found" });
      }

      return res.status(200).json({ success: true, data: results[0] });
    },
  );
};

export const cancelBooking = (req, res) => {
  const user_id = req.params.user_id || req.user?.id;
  const booking_id = req.params.id;

  db.getConnection((err, conn) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "Server error", error: err.message });
    }

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).json({
          success: false,
          message: "Transaction error",
          error: txErr.message,
        });
      }

      conn.query(
        `SELECT id, event_id, ticket_count, status
         FROM booked_tickets
         WHERE id = ? AND user_id = ? FOR UPDATE`,
        [booking_id, user_id],
        (err2, results) => {
          if (err2) {
            return conn.rollback(() => {
              conn.release();
              return res.status(500).json({
                success: false,
                message: "Server error",
                error: err2.message,
              });
            });
          }

          if (!results || results.length === 0) {
            return conn.rollback(() => {
              conn.release();
              return res
                .status(404)
                .json({ success: false, message: "Booking not found" });
            });
          }

          const booking = results[0];
          if (booking.status === "cancelled") {
            return conn.rollback(() => {
              conn.release();
              return res
                .status(400)
                .json({ success: false, message: "Already cancelled" });
            });
          }

          conn.query(
            `UPDATE booked_tickets SET status = 'cancelled' WHERE id = ?`,
            [booking_id],
            (err3) => {
              if (err3) {
                return conn.rollback(() => {
                  conn.release();
                  return res.status(500).json({
                    success: false,
                    message: "Server error",
                    error: err3.message,
                  });
                });
              }

              conn.query(
                `UPDATE events
                 SET tickets_sold = GREATEST(0, COALESCE(tickets_sold, 0) - ?),
                     registration_count = GREATEST(0, COALESCE(registration_count, 0) - ?)
                 WHERE id = ?`,
                [booking.ticket_count, booking.ticket_count, booking.event_id],
                (err4) => {
                  if (err4) {
                    return conn.rollback(() => {
                      conn.release();
                      return res.status(500).json({
                        success: false,
                        message: "Server error",
                        error: err4.message,
                      });
                    });
                  }

                  conn.commit((err5) => {
                    conn.release();
                    if (err5) {
                      return res.status(500).json({
                        success: false,
                        message: "Commit failed",
                        error: err5.message,
                      });
                    }
                    return res.status(200).json({
                      success: true,
                      message: "Booking cancelled successfully",
                    });
                  });
                },
              );
            },
          );
        },
      );
    });
  });
};
