/**
 * GST tax invoices for subscription recurring payments.
 */
import dbPromise from "#db/promise";
import {
  splitGstFromTotal,
  splitGstForState,
  resolveBuyerStateForTax,
  getSellerConfig,
  getHsnSac,
  getGstRate,
} from "../utils/gstCalculation.js";
import {
  getExpectedSubscriptionChargeAmount,
  paymentMatchesSubscriptionCharge,
} from "../utils/subscriptionChargeAmount.js";

const FY_START_MONTH = 3; // April = Indian FY start

function financialYearLabel(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth();
  const year = d.getFullYear();
  if (month >= FY_START_MONTH) {
    return `${String(year).slice(-2)}${String(year + 1).slice(-2)}`;
  }
  return `${String(year - 1).slice(-2)}${String(year).slice(-2)}`;
}

async function nextInvoiceNumber(conn) {
  const fy = financialYearLabel();
  const prefix = `REP/${fy}/`;
  const [rows] = await conn.query(
    `SELECT invoice_number FROM subscription_gst_invoices
     WHERE invoice_number LIKE ?
     ORDER BY id DESC LIMIT 1
     FOR UPDATE`,
    [`${prefix}%`],
  );
  let seq = 1;
  if (rows[0]?.invoice_number) {
    const part = String(rows[0].invoice_number).split("/").pop();
    const n = parseInt(part, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

async function loadPartnerProfile(role, userId) {
  if (role === "project") {
    const [rows] = await dbPromise.query(
      `SELECT fullname, email, contact, state, city FROM projectpartner WHERE id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }
  if (role === "sales") {
    const [rows] = await dbPromise.query(
      `SELECT fullname, email, contact, state, city FROM salespersons WHERE salespersonsid = ? LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }
  if (role === "territory") {
    const [rows] = await dbPromise.query(
      `SELECT fullname, email, contact, state, city FROM territorypartner WHERE id = ? LIMIT 1`,
      [userId],
    );
    return rows[0] || null;
  }
  return null;
}

async function loadPaymentContext(recurringPaymentId) {
  const [rows] = await dbPromise.query(
    `SELECT rp.*, us.user_id, us.role, us.plan_id, sp.plan_name, sp.base_price AS plan_base_price,
            sp.gst_amount AS plan_gst_amount, sp.price AS plan_total_price
     FROM subscription_recurring_payments rp
     JOIN user_subscriptions us ON us.id = rp.user_subscription_id
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE rp.id = ?
     LIMIT 1`,
    [recurringPaymentId],
  );
  return rows[0] || null;
}

export async function getInvoiceByRecurringPaymentId(recurringPaymentId) {
  const [rows] = await dbPromise.query(
    `SELECT * FROM subscription_gst_invoices WHERE recurring_payment_id = ? LIMIT 1`,
    [recurringPaymentId],
  );
  return rows[0] || null;
}

export async function generateInvoiceForPayment(recurringPaymentId) {
  const paymentId = Number(recurringPaymentId);
  if (!paymentId) return { skipped: true, reason: "invalid_id" };

  const existing = await getInvoiceByRecurringPaymentId(paymentId);
  if (existing) return { skipped: true, reason: "already_exists", invoice: existing };

  const ctx = await loadPaymentContext(paymentId);
  if (!ctx) return { skipped: true, reason: "payment_not_found" };

  if (!["captured", "authorized"].includes(String(ctx.status || "").toLowerCase())) {
    return { skipped: true, reason: "payment_not_successful" };
  }

  const seller = getSellerConfig();
  const partner = await loadPartnerProfile(ctx.role, ctx.user_id);
  const rate = getGstRate();
  const totalCharged = Number(ctx.amount);
  const expectedCharge = getExpectedSubscriptionChargeAmount(ctx);
  if (
    expectedCharge != null &&
    !paymentMatchesSubscriptionCharge(totalCharged, expectedCharge)
  ) {
    return {
      skipped: true,
      reason: "amount_mismatch",
      expected: expectedCharge,
      actual: totalCharged,
    };
  }

  let baseAmount;
  let gstTotal;
  if (ctx.plan_base_price > 0 && ctx.plan_total_price > 0) {
    const ratio = totalCharged / Number(ctx.plan_total_price);
    baseAmount = Math.round(Number(ctx.plan_base_price) * ratio * 100) / 100;
    gstTotal = Math.round((totalCharged - baseAmount) * 100) / 100;
  } else {
    const split = splitGstFromTotal(totalCharged, rate);
    baseAmount = split.base;
    gstTotal = split.gst;
  }

  const buyerStateForTax = resolveBuyerStateForTax(partner?.state, seller.state);
  const taxSplit = splitGstForState(seller.state, buyerStateForTax, baseAmount, rate);

  const paidAt = ctx.paid_at || ctx.created_at || new Date();
  const invoiceDate = paidAt;

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const invoiceNumber = await nextInvoiceNumber(conn);

    const [result] = await conn.query(
      `INSERT INTO subscription_gst_invoices (
        recurring_payment_id, user_subscription_id, razorpay_payment_id,
        invoice_number, invoice_date, paid_at,
        buyer_name, buyer_email, buyer_contact, buyer_state, buyer_city, buyer_gstin,
        seller_name, seller_gstin, seller_address,
        plan_name, hsn_sac, base_amount, gst_rate,
        cgst_amount, sgst_amount, igst_amount, total_amount,
        tax_type, place_of_supply, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        ctx.user_subscription_id,
        ctx.razorpay_payment_id,
        invoiceNumber,
        invoiceDate,
        paidAt,
        partner?.fullname || null,
        partner?.email || null,
        partner?.contact || null,
        buyerStateForTax,
        partner?.city || null,
        null,
        seller.name,
        seller.gstin || null,
        seller.address,
        ctx.plan_name || "Partner Subscription",
        getHsnSac(),
        baseAmount,
        rate,
        taxSplit.cgst_amount,
        taxSplit.sgst_amount,
        taxSplit.igst_amount,
        totalCharged,
        taxSplit.tax_type,
        taxSplit.place_of_supply,
        ctx.currency || "INR",
      ],
    );

    await conn.commit();
    const [inv] = await dbPromise.query(
      `SELECT * FROM subscription_gst_invoices WHERE id = ?`,
      [result.insertId],
    );
    return { created: true, invoice: inv[0] };
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      const again = await getInvoiceByRecurringPaymentId(paymentId);
      return { skipped: true, reason: "duplicate", invoice: again };
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function getPaymentIdByRazorpayPaymentId(razorpayPaymentId) {
  const [rows] = await dbPromise.query(
    `SELECT id FROM subscription_recurring_payments WHERE razorpay_payment_id = ? LIMIT 1`,
    [razorpayPaymentId],
  );
  return rows[0]?.id || null;
}

/** Called after upsert — non-throwing */
export async function tryGenerateInvoiceForRazorpayPayment(razorpayPaymentId) {
  try {
    const pid = await getPaymentIdByRazorpayPaymentId(razorpayPaymentId);
    if (!pid) return;
    await generateInvoiceForPayment(pid);
  } catch (err) {
    console.error("[gst-invoice] generate failed:", err.message);
  }
}

export async function listGstInvoices({
  page = 1,
  limit = 25,
  role,
  search,
  fromDate,
  toDate,
  subscriptionStatus,
}) {
  const offset = (Math.max(1, page) - 1) * limit;
  const conditions = ["1=1"];
  const params = [];

  if (role) {
    conditions.push("us.role = ?");
    params.push(role);
  }
  if (fromDate) {
    conditions.push("gi.invoice_date >= ?");
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push("gi.invoice_date <= ?");
    params.push(`${toDate} 23:59:59`);
  }
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      `(gi.invoice_number LIKE ? OR gi.razorpay_payment_id LIKE ? OR gi.buyer_name LIKE ? OR gi.buyer_email LIKE ? OR gi.plan_name LIKE ?)`,
    );
    params.push(q, q, q, q, q);
  }
  if (subscriptionStatus) {
    const st = String(subscriptionStatus).toLowerCase();
    if (["active", "cancelled", "expired", "pending", "halted"].includes(st)) {
      conditions.push("LOWER(us.status) = ?");
      params.push(st);
    }
  }

  const where = conditions.join(" AND ");

  const [countRows] = await dbPromise.query(
    `SELECT COUNT(*) AS total
     FROM subscription_gst_invoices gi
     JOIN user_subscriptions us ON us.id = gi.user_subscription_id
     WHERE ${where}`,
    params,
  );

  const [rows] = await dbPromise.query(
    `SELECT gi.*, us.role, us.user_id, us.status AS subscription_status,
            rp.charge_number, rp.status AS payment_status
     FROM subscription_gst_invoices gi
     JOIN user_subscriptions us ON us.id = gi.user_subscription_id
     LEFT JOIN subscription_recurring_payments rp ON rp.id = gi.recurring_payment_id
     WHERE ${where}
     ORDER BY gi.invoice_date DESC, gi.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    total: Number(countRows[0]?.total) || 0,
    page,
    limit,
    items: rows,
  };
}

export async function getGstInvoiceById(id) {
  const [rows] = await dbPromise.query(
    `SELECT gi.*, us.role, us.user_id, rp.charge_number, rp.status AS payment_status,
            rp.billing_cycle_start, rp.billing_cycle_end
     FROM subscription_gst_invoices gi
     JOIN user_subscriptions us ON us.id = gi.user_subscription_id
     LEFT JOIN subscription_recurring_payments rp ON rp.id = gi.recurring_payment_id
     WHERE gi.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function getGstSummaryMtd() {
  const [rows] = await dbPromise.query(
    `SELECT
       COUNT(*) AS invoice_count,
       COALESCE(SUM(base_amount), 0) AS total_base,
       COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS total_gst,
       COALESCE(SUM(total_amount), 0) AS total_billed
     FROM subscription_gst_invoices
     WHERE invoice_date >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
  );
  return rows[0] || {};
}

/** Recompute CGST/SGST/IGST for existing rows (e.g. after tax rule fix). */
export async function repairAllInvoiceTaxBreakups() {
  const seller = getSellerConfig();
  const [rows] = await dbPromise.query(`SELECT * FROM subscription_gst_invoices`);
  let updated = 0;
  for (const inv of rows) {
    const buyerStateForTax = resolveBuyerStateForTax(inv.buyer_state, seller.state);
    const taxSplit = splitGstForState(
      seller.state,
      buyerStateForTax,
      Number(inv.base_amount),
      Number(inv.gst_rate) || getGstRate(),
    );
    await dbPromise.query(
      `UPDATE subscription_gst_invoices
       SET buyer_state = COALESCE(buyer_state, ?),
           cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
           tax_type = ?, place_of_supply = ?
       WHERE id = ?`,
      [
        buyerStateForTax,
        taxSplit.cgst_amount,
        taxSplit.sgst_amount,
        taxSplit.igst_amount,
        taxSplit.tax_type,
        taxSplit.place_of_supply,
        inv.id,
      ],
    );
    updated += 1;
  }
  return { updated };
}

export async function backfillMissingInvoices(limit = 100) {
  const [rows] = await dbPromise.query(
    `SELECT rp.id
     FROM subscription_recurring_payments rp
     LEFT JOIN subscription_gst_invoices gi ON gi.recurring_payment_id = rp.id
     WHERE gi.id IS NULL AND rp.status IN ('captured', 'authorized')
     ORDER BY rp.id ASC
     LIMIT ?`,
    [limit],
  );

  let created = 0;
  for (const row of rows) {
    const res = await generateInvoiceForPayment(row.id);
    if (res.created) created += 1;
  }
  return { processed: rows.length, created };
}
