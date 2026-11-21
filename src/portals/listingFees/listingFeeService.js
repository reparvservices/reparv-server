/**
 * Paid listings for website users: the first listing is free, later ones cost a fee the admin sets.
 *
 * Safety rules:
 *  - the free-or-pending decision runs in a transaction that locks the user's row, so two listings
 *    created at the same moment can't both use the single free allowance;
 *  - the free allowance is counted from a ledger, so deleting a listing never earns another free one;
 *  - the amount charged always comes from the ledger row written by the server, never from the request;
 *  - one Razorpay payment confirms one listing (claim table shared with subscriptions and venues);
 *  - if the feature tables don't exist yet (migration not applied) the feature is simply OFF.
 */
import dbPromise from "#db/promise";
import { verifyCheckoutSignature } from "#utils/razorpaySignature.js";
import { claimPayment, markApplied, releaseClaim, createSqlClaimStore } from "../subscription/utils/paymentClaims.js";
import { getRazorpay, httpError } from "../venues/venueService.js";
import { decideListingFee, feeBreakdown, validateRule, validateSettings } from "./listingFeePricing.js";

export const CHECKOUT_TAG = "listing_fee";
const CLAIM_ROLE = "listing_fee";
const GST_RATE = () => Number(process.env.SUBSCRIPTION_GST_RATE || 18);

const DEFAULT_SETTINGS = { enabled: 0, free_per_user: 1, default_fee: 0, go_live_at: null };

const claimStore = createSqlClaimStore((sql, params) => dbPromise.query(sql, params).then((r) => r[0]));
const rows = async (sql, params = []) => (await dbPromise.query(sql, params))[0];
const isMissingTable = (err) => err?.code === "ER_NO_SUCH_TABLE";

// ───────────────────────────── settings, rules, quotes ─────────────────────────────

export async function getSettings(db = dbPromise) {
  try {
    const [r] = await db.query("SELECT * FROM listing_fee_settings WHERE id = 1");
    return r[0] || DEFAULT_SETTINGS;
  } catch (err) {
    if (isMissingTable(err)) return DEFAULT_SETTINGS;
    throw err;
  }
}

export async function getRules(db = dbPromise) {
  try {
    return (await db.query("SELECT id, listing_type, property_category, amount FROM listing_fee_rules ORDER BY property_category, listing_type"))[0];
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function countFreeUsed(userId, db = dbPromise) {
  try {
    const [r] = await db.query("SELECT COUNT(*) AS n FROM listing_fee_payments WHERE user_id = ? AND kind = 'free'", [userId]);
    return Number(r[0].n) || 0;
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

/** What would creating a listing of this type cost this user right now? (read-only) */
export async function quoteForUser(userId, { listingType, category }) {
  const [settings, rulesList, freeUsed] = await Promise.all([getSettings(), getRules(), countFreeUsed(userId)]);
  const d = decideListingFee({ settings, rules: rulesList, freeUsed, listingType, category, gstRate: GST_RATE() });
  return {
    enabled: Boolean(Number(settings.enabled)),
    mode: d.mode,
    payment_required: d.mode === "paid",
    fee: d.fee,
    gst_percent: GST_RATE(),
    free_per_user: Number(settings.free_per_user) || 0,
    free_left: Math.max(0, (Number(settings.free_per_user) || 0) - freeUsed),
  };
}

// ───────────────────────────── a new listing: free or pending ─────────────────────────────

/**
 * Called right after a website user's listing row is inserted. Marks it free (and records the use of
 * the allowance) or pending (hidden until paid). Idempotent: a listing is only decided once.
 * @returns {{ mode: string, payment_required: boolean, fee: object, property_id: number }}
 */
export async function assignListingFee({ userId, propertyId }) {
  const settings = await getSettings();
  if (!Number(settings.enabled)) return { mode: "off", payment_required: false, fee: feeBreakdown(0, GST_RATE()), property_id: propertyId };

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SELECT id FROM guestUsers WHERE id = ? FOR UPDATE", [userId]);
    const [[p]] = await conn.query(
      "SELECT propertyid, guestUserId, listingType, propertyCategory, fee_status FROM properties WHERE propertyid = ? FOR UPDATE",
      [propertyId],
    );
    if (!p || Number(p.guestUserId) !== Number(userId)) throw httpError(404, "Listing not found.");

    if (p.fee_status) {
      await conn.commit();
      const [[ledger]] = await dbPromise.query("SELECT base_amount, gst_amount, total_amount FROM listing_fee_payments WHERE property_id = ? ORDER BY id DESC LIMIT 1", [propertyId]);
      return {
        mode: p.fee_status === "pending" ? "paid" : "free",
        payment_required: p.fee_status === "pending",
        fee: ledger ? { base: ledger.base_amount, gst: ledger.gst_amount, total: ledger.total_amount } : feeBreakdown(0, GST_RATE()),
        property_id: propertyId,
      };
    }

    const [rulesList, freeUsed] = await Promise.all([getRules(conn), countFreeUsed(userId, conn)]);
    const d = decideListingFee({ settings, rules: rulesList, freeUsed, listingType: p.listingType, category: p.propertyCategory, gstRate: GST_RATE() });

    if (d.mode === "free" || d.mode === "waived") {
      await conn.query(
        "INSERT INTO listing_fee_payments (user_id, property_id, kind, status) VALUES (?, ?, ?, 'free')",
        [userId, propertyId, d.mode],
      );
      await conn.query("UPDATE properties SET fee_status = 'free' WHERE propertyid = ?", [propertyId]);
    } else {
      await conn.query(
        "INSERT INTO listing_fee_payments (user_id, property_id, kind, status, base_amount, gst_amount, total_amount) VALUES (?, ?, 'paid', 'pending', ?, ?, ?)",
        [userId, propertyId, d.fee.base, d.fee.gst, d.fee.total],
      );
      await conn.query("UPDATE properties SET fee_status = 'pending' WHERE propertyid = ?", [propertyId]);
    }
    await conn.commit();
    return { mode: d.mode, payment_required: d.mode === "paid", fee: d.fee, property_id: propertyId };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// ───────────────────────────── payment ─────────────────────────────

async function ownPendingListing(userId, propertyId) {
  const [p] = await rows("SELECT propertyid, guestUserId, fee_status FROM properties WHERE propertyid = ?", [propertyId]);
  if (!p) throw httpError(404, "Listing not found.");
  if (Number(p.guestUserId) !== Number(userId)) throw httpError(403, "This listing belongs to another account.");
  if (p.fee_status !== "pending") throw httpError(409, "No payment is needed for this listing.");
  const [ledger] = await rows(
    "SELECT * FROM listing_fee_payments WHERE property_id = ? AND kind = 'paid' AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [propertyId],
  );
  if (!ledger) throw httpError(409, "No payment is needed for this listing.");
  return { p, ledger };
}

/** Open a Razorpay order for an unpaid listing. */
export async function createFeeOrder({ userId, propertyId }) {
  const { ledger } = await ownPendingListing(userId, propertyId);
  let order;
  try {
    order = await getRazorpay().orders.create({
      amount: Math.round(ledger.total_amount * 100),
      currency: "INR",
      receipt: `LF${ledger.id}`,
      notes: { checkout: CHECKOUT_TAG, property_id: String(propertyId), user_id: String(userId), ledger_id: String(ledger.id) },
    });
  } catch (err) {
    throw httpError(502, "Could not start the payment. Please try again.");
  }
  await rows("UPDATE listing_fee_payments SET razorpay_order_id = ? WHERE id = ?", [order.id, ledger.id]);
  return {
    property_id: propertyId,
    order_id: order.id,
    key: process.env.RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: "INR",
    fee: { base: ledger.base_amount, gst: ledger.gst_amount, total: ledger.total_amount },
  };
}

/** Confirm a paid listing. Used by both the verify call and the order.paid webhook, so it is idempotent. */
export async function confirmFeePayment({ orderId, paymentId, userId = null }) {
  const razorpay = getRazorpay();
  const order = await razorpay.orders.fetch(orderId);
  if (order?.notes?.checkout !== CHECKOUT_TAG) throw httpError(400, "Not a listing fee order.");

  const [ledger] = await rows("SELECT * FROM listing_fee_payments WHERE id = ?", [Number(order.notes.ledger_id)]);
  if (!ledger || ledger.razorpay_order_id !== orderId) throw httpError(404, "Payment record not found.");
  if (userId !== null && Number(ledger.user_id) !== Number(userId)) throw httpError(403, "This payment belongs to another account.");

  const claim = await claimPayment(claimStore, paymentId, { role: CLAIM_ROLE, userId: ledger.user_id });
  if (claim === "other_user") throw httpError(409, "This payment was already used for a different listing.");
  if (claim === "applied") return { success: true, already: true, property_id: ledger.property_id, fee_status: "paid" };
  if (claim === "processing") throw httpError(409, "Payment is being confirmed. Please retry in a moment.");

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId) throw httpError(400, "Payment does not belong to this order.");
    if (Number(payment.amount) !== Math.round(ledger.total_amount * 100)) throw httpError(400, "Paid amount does not match the listing fee.");
    let status = payment.status;
    if (status === "authorized") status = (await razorpay.payments.capture(paymentId, payment.amount, payment.currency || "INR")).status;
    if (status !== "captured") throw httpError(402, "Payment has not been completed.");

    const conn = await dbPromise.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE listing_fee_payments SET status = 'paid', razorpay_payment_id = ?, paid_at = NOW() WHERE id = ? AND status = 'pending'", [paymentId, ledger.id]);
      await conn.query("UPDATE properties SET fee_status = 'paid' WHERE propertyid = ? AND fee_status = 'pending'", [ledger.property_id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    await markApplied(claimStore, paymentId);
    return { success: true, property_id: ledger.property_id, fee_status: "paid" };
  } catch (err) {
    await releaseClaim(claimStore, paymentId);
    throw err;
  }
}

export async function verifyFeePayment({ userId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const missing = [];
  if (!razorpay_order_id) missing.push("razorpay_order_id");
  if (!razorpay_payment_id) missing.push("razorpay_payment_id");
  if (!razorpay_signature) missing.push("razorpay_signature");
  if (missing.length) throw httpError(400, "Missing required fields", { missingFields: missing });
  if (!verifyCheckoutSignature(process.env.RAZORPAY_KEY_SECRET, razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    throw httpError(400, "Invalid signature");
  }
  return confirmFeePayment({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, userId });
}

/** Razorpay order.paid webhook: confirms even if the customer's browser never called verify. */
export async function handleListingFeeOrderPaidWebhook(payload) {
  const payment = payload?.payment?.entity;
  const orderId = payload?.order?.entity?.id || payment?.order_id;
  if (!orderId || !payment?.id) return { ok: true, handled: false, note: "no order/payment id" };
  const order = await getRazorpay().orders.fetch(orderId);
  if (order?.notes?.checkout !== CHECKOUT_TAG) return { ok: true, handled: false, note: "not a listing fee order" };
  try {
    await confirmFeePayment({ orderId, paymentId: payment.id });
    return { ok: true, handled: true };
  } catch (err) {
    if (err?.statusCode && err.statusCode < 500) {
      console.warn("[listing fee webhook] not applied:", err.message);
      return { ok: false, handled: true, note: err.message };
    }
    throw err;
  }
}

// ───────────────────────────── admin ─────────────────────────────

export async function adminGetConfig() {
  return { settings: await getSettings(), rules: await getRules(), gst_percent: GST_RATE() };
}

export async function adminSaveSettings({ enabled, free_per_user, default_fee }) {
  const bad = validateSettings({ free_per_user, default_fee });
  if (bad) throw httpError(400, bad);
  const on = enabled ? 1 : 0;
  // the day it is first switched on becomes the start date; later toggles keep it
  await dbPromise.query(
    `UPDATE listing_fee_settings
        SET enabled = ?, free_per_user = ?, default_fee = ?,
            go_live_at = CASE WHEN ? = 1 AND go_live_at IS NULL THEN NOW() ELSE go_live_at END
      WHERE id = 1`,
    [on, Number(free_per_user), Number(default_fee), on],
  );
  return getSettings();
}

export async function adminSaveRule(body) {
  const bad = validateRule(body);
  if (bad) throw httpError(400, bad);
  await dbPromise.query(
    `INSERT INTO listing_fee_rules (listing_type, property_category, amount) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
    [body.listing_type, String(body.property_category).trim(), Number(body.amount)],
  );
  return getRules();
}

export async function adminDeleteRule(id) {
  await dbPromise.query("DELETE FROM listing_fee_rules WHERE id = ?", [id]);
  return getRules();
}

export async function adminListPayments(limit = 200) {
  return rows(
    `SELECT l.id, l.user_id, l.property_id, l.kind, l.status, l.base_amount, l.gst_amount, l.total_amount,
            l.razorpay_payment_id, l.created_at, l.paid_at,
            g.fullname AS user_name, g.contact AS user_contact, p.propertyName AS property_name
       FROM listing_fee_payments l
       LEFT JOIN guestUsers g ON g.id = l.user_id
       LEFT JOIN properties p ON p.propertyid = l.property_id
      WHERE l.kind = 'paid'
      ORDER BY l.id DESC LIMIT ?`,
    [Math.min(Number(limit) || 200, 500)],
  );
}
