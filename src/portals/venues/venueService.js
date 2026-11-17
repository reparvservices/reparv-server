/**
 * Venue booking (villas, halls ...): listings, availability, holds, payment confirmation,
 * cancellation + refunds. Money is whole rupees in the DB; Razorpay gets paise.
 *
 * Safety rules:
 *  - a slot is taken inside a transaction that locks the listing row, so two customers can never
 *    both hold overlapping dates;
 *  - one Razorpay payment confirms one booking (claim table shared with subscriptions);
 *  - the customer, the amount and the order are all re-checked against Razorpay before confirming;
 *  - every price comes from the server (quote), never from the request.
 */
import crypto from "node:crypto";
import Razorpay from "razorpay";
import dbPromise from "#db/promise";
import { verifyCheckoutSignature } from "#utils/razorpaySignature.js";
import { claimPayment, markApplied, releaseClaim, createSqlClaimStore } from "../subscription/utils/paymentClaims.js";
import { normaliseStay, quoteStay, refundFor, staysOverlap, addDays, policyText } from "./venuePricing.js";

export const HOLD_MINUTES = 10;
export const CHECKOUT_TAG = "venue_booking";
const CLAIM_ROLE = "venue";

let razorpayClient = null;
const getRazorpay = () =>
  (razorpayClient ??= new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  }));
/** Test hook: swap the Razorpay client. */
export const __setRazorpayForTests = (client) => { razorpayClient = client; };

const rows = async (sql, params = []) => (await dbPromise.query(sql, params))[0];
const claimStore = createSqlClaimStore((sql, params) => dbPromise.query(sql, params).then((r) => r[0]));

export const httpError = (statusCode, message, meta) => Object.assign(new Error(message), { statusCode, meta });

/** Today in India (the venues' calendar), as YYYY-MM-DD. */
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);

const LISTING_COLS = `id, owner_role, owner_id, type, title, slug, description, city, state, address,
  latitude, longitude, capacity, bedrooms, amenities, rules, images, price_model, base_price,
  weekend_price, cleaning_fee, gst_percent, deposit_percent, commission_percent, cancellation_policy,
  min_nights, max_nights, status, reject_reason, created_at, updated_at`;

const BOOKING_COLS = `id, booking_ref, listing_id, customer_id,
  DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date, DATE_FORMAT(end_date,'%Y-%m-%d') AS end_date,
  slot, guests, subtotal, gst_amount, total_amount, payable_now, amount_paid, commission_percent,
  cancellation_policy, status, hold_expires_at, razorpay_order_id, razorpay_payment_id,
  refund_amount, refund_id, cancel_reason, cancelled_by, guest_name, guest_phone, notes,
  created_at, updated_at`;

const publicListing = (l) => l && ({
  ...l,
  amenities: parseJson(l.amenities, []),
  images: parseJson(l.images, []),
  cancellation_text: policyText(l.cancellation_policy),
});
function parseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
// owner-only fields never leave to customers
const customerView = (l) => {
  const p = publicListing(l);
  if (!p) return p;
  delete p.owner_id; delete p.owner_role; delete p.commission_percent; delete p.reject_reason;
  return p;
};

// ───────────────────────────── listings (customer reads) ─────────────────────────────

export async function searchListings({ city, type, guests, min_price, max_price, q, page = 1, limit = 20 } = {}) {
  const where = ["status = 'live'"];
  const params = [];
  if (city) { where.push("city = ?"); params.push(String(city)); }
  if (type) { where.push("type = ?"); params.push(String(type)); }
  if (guests) { where.push("capacity >= ?"); params.push(Number(guests) || 1); }
  if (min_price) { where.push("base_price >= ?"); params.push(Number(min_price) || 0); }
  if (max_price) { where.push("base_price <= ?"); params.push(Number(max_price) || 0); }
  if (q) { where.push("(title LIKE ? OR city LIKE ? OR address LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const off = (Math.max(1, Number(page) || 1) - 1) * lim;
  const list = await rows(
    `SELECT ${LISTING_COLS} FROM venue_listings WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, lim + 1, off],
  );
  return { listings: list.slice(0, lim).map(customerView), hasMore: list.length > lim };
}

export async function getLiveListing(id) {
  const [l] = await rows(`SELECT ${LISTING_COLS} FROM venue_listings WHERE id = ? AND status = 'live'`, [id]);
  if (!l) throw httpError(404, "Listing not found.");
  return l;
}

export async function getPublicListing(id) {
  return customerView(await getLiveListing(id));
}

/** Dates that cannot be booked between `from` and `to` (YYYY-MM-DD, `to` exclusive). */
export async function getAvailability(listingId, from, to) {
  await getLiveListing(listingId);
  const booked = await rows(
    `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS start, DATE_FORMAT(end_date,'%Y-%m-%d') AS end, slot
     FROM venue_bookings
     WHERE listing_id = ? AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
       AND start_date < ? AND end_date > ?`,
    [listingId, to, from],
  );
  const blocked = await rows(
    `SELECT DATE_FORMAT(block_date,'%Y-%m-%d') AS date, slot FROM venue_blocked_dates
     WHERE listing_id = ? AND block_date >= ? AND block_date < ?`,
    [listingId, from, to],
  );
  return { booked, blocked };
}

export async function quoteForListing(listingId, input) {
  const listing = await getLiveListing(listingId);
  const stay = normaliseStay(listing, input, todayIST());
  if (!stay.ok) throw httpError(400, stay.message);
  const guests = Math.max(1, Number(input.guests) || 1);
  if (guests > listing.capacity) throw httpError(400, `This venue fits up to ${listing.capacity} guests.`);
  return { listing: customerView(listing), stay, guests, quote: quoteStay(listing, stay), cancellation_text: policyText(listing.cancellation_policy) };
}

// ───────────────────────────── booking (hold + order) ─────────────────────────────

const newRef = () => "VB" + crypto.randomBytes(5).toString("hex").toUpperCase();

async function assertSlotFree(conn, listingId, stay, ignoreBookingId = null) {
  const bookings = await conn.query(
    `SELECT id, DATE_FORMAT(start_date,'%Y-%m-%d') AS start, DATE_FORMAT(end_date,'%Y-%m-%d') AS end, slot
     FROM venue_bookings
     WHERE listing_id = ? AND id <> ? AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
       AND start_date < ? AND end_date > ?`,
    [listingId, ignoreBookingId ?? 0, stay.end, stay.start],
  ).then((r) => r[0]);
  if (bookings.some((b) => staysOverlap(stay, b))) throw httpError(409, "Those dates are no longer available.");

  const blocked = await conn.query(
    `SELECT DATE_FORMAT(block_date,'%Y-%m-%d') AS d, slot FROM venue_blocked_dates
     WHERE listing_id = ? AND block_date >= ? AND block_date < ?`,
    [listingId, stay.start, stay.end],
  ).then((r) => r[0]);
  if (blocked.some((b) => staysOverlap(stay, { start: b.d, end: addDays(b.d, 1), slot: b.slot }))) {
    throw httpError(409, "The owner is not accepting bookings for those dates.");
  }
}

/** Hold the dates and open a Razorpay order for the amount due now. */
export async function createBooking({ customer, listingId, input }) {
  const base = await quoteForListing(listingId, input); // validates listing, dates, capacity
  const { stay, guests, quote } = base;

  const conn = await dbPromise.getConnection();
  let bookingId;
  let ref;
  try {
    await conn.beginTransaction();
    // Serialise everyone booking this listing
    const [locked] = await conn.query(`SELECT id, status, commission_percent, cancellation_policy FROM venue_listings WHERE id = ? FOR UPDATE`, [listingId]).then((r) => r[0]);
    if (!locked || locked.status !== "live") throw httpError(404, "Listing not found.");
    await assertSlotFree(conn, listingId, stay);

    ref = newRef();
    const [ins] = await conn.query(
      `INSERT INTO venue_bookings
        (booking_ref, listing_id, customer_id, start_date, end_date, slot, guests, subtotal, gst_amount,
         total_amount, payable_now, commission_percent, cancellation_policy, status, hold_expires_at,
         guest_name, guest_phone)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'held', NOW() + INTERVAL ? MINUTE, ?, ?)`,
      [ref, listingId, customer.id, stay.start, stay.end, stay.slot, guests, quote.subtotal, quote.gst_amount,
        quote.total_amount, quote.payable_now, locked.commission_percent, locked.cancellation_policy, HOLD_MINUTES,
        String(input.guest_name || customer.fullname || "").slice(0, 150) || null,
        String(input.guest_phone || customer.contact || "").slice(0, 20) || null],
    );
    bookingId = ins.insertId;
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  try {
    const order = await getRazorpay().orders.create({
      amount: Math.round(quote.payable_now * 100),
      currency: "INR",
      receipt: ref,
      notes: { checkout: CHECKOUT_TAG, venue_booking_id: String(bookingId), customer_id: String(customer.id), booking_ref: ref },
    });
    await rows(`UPDATE venue_bookings SET razorpay_order_id = ? WHERE id = ?`, [order.id, bookingId]);
    return {
      booking_id: bookingId,
      booking_ref: ref,
      order_id: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: "INR",
      hold_expires_in_seconds: HOLD_MINUTES * 60,
      quote,
    };
  } catch (err) {
    // Could not open a payment: release the dates straight away
    await rows(`UPDATE venue_bookings SET status = 'expired', hold_expires_at = NOW() WHERE id = ?`, [bookingId]).catch(() => {});
    throw httpError(502, "Could not start the payment. Please try again.");
  }
}

// ───────────────────────────── payment confirmation ─────────────────────────────

/**
 * Confirm the booking behind `orderId` once `paymentId` is genuinely paid. Used by both the
 * app's verify call and the order.paid webhook, so it must be idempotent.
 * `customerId` (when known, i.e. from the app) must own the booking.
 */
export async function confirmBookingPayment({ orderId, paymentId, customerId = null }) {
  const razorpay = getRazorpay();
  const order = await razorpay.orders.fetch(orderId);
  if (order?.notes?.checkout !== CHECKOUT_TAG) throw httpError(400, "Not a venue booking order.");

  const bookingId = Number(order.notes.venue_booking_id);
  const [booking] = await rows(`SELECT ${BOOKING_COLS} FROM venue_bookings WHERE id = ?`, [bookingId]);
  if (!booking || booking.razorpay_order_id !== orderId) throw httpError(404, "Booking not found.");
  if (customerId !== null && Number(booking.customer_id) !== Number(customerId)) throw httpError(403, "This booking belongs to another account.");

  const owner = { role: CLAIM_ROLE, userId: booking.customer_id };
  const claim = await claimPayment(claimStore, paymentId, owner);
  if (claim === "other_user") throw httpError(409, "This payment was already used for a different booking.");
  if (claim === "applied") return { success: true, already: true, booking: await loadBooking(bookingId) };
  if (claim === "processing") throw httpError(409, "Payment is being confirmed. Please retry in a moment.");

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId) throw httpError(400, "Payment does not belong to this order.");
    if (Number(payment.amount) !== Math.round(booking.payable_now * 100)) throw httpError(400, "Paid amount does not match the booking.");
    let status = payment.status;
    if (status === "authorized") status = (await razorpay.payments.capture(paymentId, payment.amount, payment.currency || "INR")).status;
    if (status !== "captured") throw httpError(402, "Payment has not been completed.");

    const result = await applyConfirmed(booking, paymentId);
    await markApplied(claimStore, paymentId);
    return { success: true, ...result, booking: await loadBooking(bookingId) };
  } catch (err) {
    await releaseClaim(claimStore, paymentId);
    throw err;
  }
}

async function applyConfirmed(booking, paymentId) {
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(`SELECT ${BOOKING_COLS} FROM venue_bookings WHERE id = ? FOR UPDATE`, [booking.id]);
    if (row.status === "confirmed") { await conn.commit(); return { already: true }; }
    if (row.status === "cancelled" || row.status === "completed") { await conn.commit(); throw httpError(409, "This booking is no longer active."); }

    // held, or an expired hold that the customer paid for after the time ran out
    await conn.query(`SELECT id FROM venue_listings WHERE id = ? FOR UPDATE`, [row.listing_id]);
    try {
      await assertSlotFree(conn, row.listing_id, { start: row.start_date, end: row.end_date, slot: row.slot }, row.id);
    } catch (clash) {
      // Dates were taken meanwhile: refund in full, nothing is confirmed
      await conn.query(`UPDATE venue_bookings SET status = 'expired', razorpay_payment_id = ? WHERE id = ?`, [paymentId, row.id]);
      await conn.commit();
      await refundPayment(row.id, paymentId, row.payable_now, "Dates were taken before payment completed").catch((e) => console.error("[venue] auto-refund failed:", e.message));
      throw httpError(409, "Those dates were booked by someone else while you were paying. Your payment will be refunded.");
    }
    await conn.query(
      `UPDATE venue_bookings SET status = 'confirmed', amount_paid = payable_now, razorpay_payment_id = ?, hold_expires_at = NULL WHERE id = ?`,
      [paymentId, row.id],
    );
    await conn.commit();
    return { already: false };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function verifyBookingPayment({ customer, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const missing = [];
  if (!razorpay_order_id) missing.push("razorpay_order_id");
  if (!razorpay_payment_id) missing.push("razorpay_payment_id");
  if (!razorpay_signature) missing.push("razorpay_signature");
  if (missing.length) throw httpError(400, "Missing required fields", { missingFields: missing });
  if (!verifyCheckoutSignature(process.env.RAZORPAY_KEY_SECRET, razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    throw httpError(400, "Invalid signature");
  }
  return confirmBookingPayment({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, customerId: customer.id });
}

/** Razorpay order.paid webhook: confirms even if the app never called verify. */
export async function handleVenueOrderPaidWebhook(payload) {
  const payment = payload?.payment?.entity;
  const orderId = payload?.order?.entity?.id || payment?.order_id;
  if (!orderId || !payment?.id) return { ok: true, handled: false, note: "no order/payment id" };
  const order = await getRazorpay().orders.fetch(orderId);
  if (order?.notes?.checkout !== CHECKOUT_TAG) return { ok: true, handled: false, note: "not a venue order" };
  try {
    await confirmBookingPayment({ orderId, paymentId: payment.id });
    return { ok: true, handled: true };
  } catch (err) {
    if (err?.statusCode && err.statusCode < 500) {
      console.warn("[venue webhook] not applied:", err.message);
      return { ok: false, handled: true, note: err.message };
    }
    throw err;
  }
}

// ───────────────────────────── bookings: read, cancel, refund ─────────────────────────────

async function loadBooking(id) {
  const [b] = await rows(`SELECT ${BOOKING_COLS} FROM venue_bookings WHERE id = ?`, [id]);
  return b || null;
}

export async function listCustomerBookings(customerId) {
  return rows(
    `SELECT ${BOOKING_COLS.replace(/\n/g, " ")}, (SELECT title FROM venue_listings WHERE id = venue_bookings.listing_id) AS listing_title,
       (SELECT city FROM venue_listings WHERE id = venue_bookings.listing_id) AS listing_city
     FROM venue_bookings WHERE customer_id = ? AND status <> 'expired' ORDER BY id DESC LIMIT 100`,
    [customerId],
  );
}

async function refundPayment(bookingId, paymentId, amountRupees, reason) {
  if (!amountRupees || amountRupees <= 0) return null;
  const r = await getRazorpay().payments.refund(paymentId, {
    amount: Math.round(amountRupees * 100),
    notes: { reason: String(reason || "").slice(0, 200), venue_booking_id: String(bookingId) },
  });
  await rows(`UPDATE venue_bookings SET refund_amount = ?, refund_id = ? WHERE id = ?`, [amountRupees, r?.id || null, bookingId]);
  return r;
}

/** Cancel a confirmed booking, refunding according to the booking's policy. */
export async function cancelBooking({ bookingId, actor, customerId = null, ownerKey = null, reason = "" }) {
  const conn = await dbPromise.getConnection();
  let row;
  let refund;
  try {
    await conn.beginTransaction();
    [[row]] = await conn.query(
      `SELECT b.id, b.listing_id, b.customer_id, b.status, b.amount_paid, b.cancellation_policy, b.razorpay_payment_id,
              DATE_FORMAT(b.start_date,'%Y-%m-%d') AS start_date, l.owner_role, l.owner_id
       FROM venue_bookings b JOIN venue_listings l ON l.id = b.listing_id WHERE b.id = ? FOR UPDATE`,
      [bookingId],
    );
    if (!row) throw httpError(404, "Booking not found.");
    if (actor === "customer" && Number(row.customer_id) !== Number(customerId)) throw httpError(403, "This booking belongs to another account.");
    if (actor === "owner" && !(row.owner_role === ownerKey?.role && String(row.owner_id) === String(ownerKey?.id))) throw httpError(403, "This is not your listing.");
    if (row.status === "cancelled") throw httpError(409, "Already cancelled.");
    if (!["held", "confirmed"].includes(row.status)) throw httpError(409, `A ${row.status} booking cannot be cancelled.`);

    if (row.status === "held") {
      refund = { percent: 0, amount: 0 };
    } else if (actor === "customer") {
      refund = refundFor(row.cancellation_policy, row.amount_paid, row.start_date, todayIST());
    } else {
      // owner / admin cancelling: the customer always gets everything back
      refund = { percent: 100, amount: row.amount_paid };
    }
    await conn.query(
      `UPDATE venue_bookings SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, hold_expires_at = NULL WHERE id = ?`,
      [String(reason || "").slice(0, 300) || null, actor, bookingId],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  let refundId = null;
  if (refund.amount > 0 && row.razorpay_payment_id) {
    try {
      refundId = (await refundPayment(bookingId, row.razorpay_payment_id, refund.amount, reason || `cancelled by ${actor}`))?.id || null;
    } catch (err) {
      console.error("[venue] refund failed - needs manual action:", bookingId, err.message);
      return { success: true, refund_percent: refund.percent, refund_amount: refund.amount, refund_status: "failed_retry_manually" };
    }
  }
  return { success: true, refund_percent: refund.percent, refund_amount: refund.amount, refund_id: refundId, refund_status: refund.amount > 0 ? "initiated" : "none" };
}

/** Cron: free dates held by unpaid bookings; mark finished stays completed. */
export async function expireHolds() {
  const expired = await dbPromise.query(
    `UPDATE venue_bookings SET status = 'expired' WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at < NOW() - INTERVAL 1 HOUR`,
  ).then((r) => r[0].affectedRows);
  const completed = await dbPromise.query(
    `UPDATE venue_bookings SET status = 'completed' WHERE status = 'confirmed' AND end_date < ?`,
    [todayIST()],
  ).then((r) => r[0].affectedRows);
  return { expired, completed };
}
