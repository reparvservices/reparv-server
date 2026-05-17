import dbPromise from "#db/promise";
import {
  listPaymentsForSubscription,
  getPaymentSummary,
  syncPaymentsFromRazorpay,
} from "../../services/recurringPayment.service.js";
import { cancelUserSubscription } from "../../services/subscriptionCancel.service.js";
import { CANONICAL_USER_SUBSCRIPTION_IDS_SQL } from "../../utils/userSubscriptionCanonical.js";

const ROLE_LABELS = {
  project: "Project Partner",
  sales: "Sales Partner",
  territory: "Territory Partner",
};

const formatDt = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * GET /admin/subscription/user-subscriptions
 * Query: role, status, search, limit, offset
 */
export const listUserSubscriptions = async (req, res) => {
  try {
    const role = String(req.query.role || "").trim().toLowerCase();
    const status = String(req.query.status || "").trim().toLowerCase();
    const search = String(req.query.search || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const where = [];
    const params = [];

    if (role && ["sales", "territory", "project"].includes(role)) {
      where.push("us.role = ?");
      params.push(role);
    }
    if (
      status &&
      ["active", "pending", "expired", "cancelled", "halted", "trial"].includes(status)
    ) {
      where.push("LOWER(us.status) = ?");
      params.push(status);
    }
    if (search) {
      const like = `%${search}%`;
      where.push(
        `(CAST(us.user_id AS CHAR) LIKE ? OR us.razorpay_subscription_id LIKE ? OR sp.plan_name LIKE ? OR pp.fullname LIKE ? OR pp.email LIKE ? OR pp.contact LIKE ? OR s.fullname LIKE ? OR s.email LIKE ? OR s.contact LIKE ? OR tp.fullname LIKE ? OR tp.email LIKE ? OR tp.contact LIKE ?)`,
      );
      params.push(like, like, like, like, like, like, like, like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const summaryParams = [];
    const summaryWhere = [];
    if (role && ["sales", "territory", "project"].includes(role)) {
      summaryWhere.push("us.role = ?");
      summaryParams.push(role);
    }
    const summaryWhereSql = summaryWhere.length ? `WHERE ${summaryWhere.join(" AND ")}` : "";

    const [summaryRows] = await dbPromise.query(
      `SELECT
         COUNT(*) AS total,
         SUM(LOWER(us.status) = 'active') AS active,
         SUM(LOWER(us.status) = 'pending') AS pending,
         SUM(LOWER(us.status) = 'cancelled') AS cancelled,
         SUM(LOWER(us.status) = 'expired') AS expired,
         SUM(LOWER(us.status) = 'halted') AS halted,
         SUM(LOWER(us.status) = 'trial') AS trial
       FROM user_subscriptions us
       INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
       ${summaryWhereSql}`,
      summaryParams,
    );

    const [countRows] = await dbPromise.query(
      `SELECT COUNT(*) AS total
       FROM user_subscriptions us
       INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       LEFT JOIN projectpartner pp ON us.role = 'project' AND pp.id = us.user_id
       LEFT JOIN salespersons s ON us.role = 'sales' AND s.salespersonsid = us.user_id
       LEFT JOIN territorypartner tp ON us.role = 'territory' AND tp.id = us.user_id
       ${whereSql}`,
      params,
    );

    const [rows] = await dbPromise.query(
      `SELECT
        us.id,
        us.user_id,
        us.role,
        us.plan_id,
        us.payment_type,
        us.razorpay_subscription_id,
        us.razorpay_customer_id,
        us.start_date,
        us.next_billing_date,
        us.end_date,
        us.status,
        us.discount_amount,
        us.final_amount,
        us.created_at,
        us.updated_at,
        sp.plan_name,
        sp.duration AS plan_duration,
        sp.billing_cycle,
        sp.price AS plan_price,
        CASE us.role
          WHEN 'project' THEN pp.fullname
          WHEN 'sales' THEN s.fullname
          WHEN 'territory' THEN tp.fullname
        END AS user_name,
        CASE us.role
          WHEN 'project' THEN pp.email
          WHEN 'sales' THEN s.email
          WHEN 'territory' THEN tp.email
        END AS user_email,
        CASE us.role
          WHEN 'project' THEN pp.contact
          WHEN 'sales' THEN s.contact
          WHEN 'territory' THEN tp.contact
        END AS user_contact
      FROM user_subscriptions us
      INNER JOIN (${CANONICAL_USER_SUBSCRIPTION_IDS_SQL}) canonical ON canonical.id = us.id
      LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
      LEFT JOIN projectpartner pp ON us.role = 'project' AND pp.id = us.user_id
      LEFT JOIN salespersons s ON us.role = 'sales' AND s.salespersonsid = us.user_id
      LEFT JOIN territorypartner tp ON us.role = 'territory' AND tp.id = us.user_id
      ${whereSql}
      ORDER BY COALESCE(us.updated_at, us.created_at) DESC, us.id DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const data = rows.map((r) => ({
      ...r,
      role_label: ROLE_LABELS[r.role] || r.role,
      start_date: formatDt(r.start_date),
      next_billing_date: formatDt(r.next_billing_date),
      end_date: formatDt(r.end_date),
      created_at: formatDt(r.created_at),
      updated_at: formatDt(r.updated_at),
    }));

    const sum = summaryRows[0] || {};
    return res.status(200).json({
      success: true,
      total: countRows[0]?.total ?? 0,
      limit,
      offset,
      summary: {
        total: Number(sum.total) || 0,
        active: Number(sum.active) || 0,
        pending: Number(sum.pending) || 0,
        cancelled: Number(sum.cancelled) || 0,
        expired: Number(sum.expired) || 0,
        halted: Number(sum.halted) || 0,
        trial: Number(sum.trial) || 0,
      },
      data,
    });
  } catch (error) {
    console.error("listUserSubscriptions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user subscriptions",
    });
  }
};

async function loadSubscriptionRow(id) {
  const [rows] = await dbPromise.query(
    `SELECT us.id, us.user_id, us.role, us.razorpay_subscription_id, us.status,
            us.final_amount, us.next_billing_date, us.start_date, us.end_date,
            sp.plan_name, sp.price AS plan_price,
            CASE us.role
              WHEN 'project' THEN pp.fullname
              WHEN 'sales' THEN s.fullname
              WHEN 'territory' THEN tp.fullname
            END AS user_name
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     LEFT JOIN projectpartner pp ON us.role = 'project' AND pp.id = us.user_id
     LEFT JOIN salespersons s ON us.role = 'sales' AND s.salespersonsid = us.user_id
     LEFT JOIN territorypartner tp ON us.role = 'territory' AND tp.id = us.user_id
     WHERE us.id = ?`,
    [id],
  );
  return rows[0] || null;
}

const formatPaymentRow = (r, gstMap = {}) => {
  const gst = gstMap[r.id] || null;
  return {
    id: r.id,
    razorpay_payment_id: r.razorpay_payment_id,
    razorpay_invoice_id: r.razorpay_invoice_id,
    amount: Number(r.amount),
    amount_paise: r.amount_paise,
    currency: r.currency,
    status: r.status,
    payment_method: r.payment_method,
    charge_number: r.charge_number,
    billing_cycle_start: formatDt(r.billing_cycle_start),
    billing_cycle_end: formatDt(r.billing_cycle_end),
    source: r.source,
    razorpay_event: r.razorpay_event,
    failure_reason: r.failure_reason,
    paid_at: formatDt(r.paid_at),
    created_at: formatDt(r.created_at),
    gst_invoice: gst
      ? {
          id: gst.id,
          invoice_number: gst.invoice_number,
          base_amount: Number(gst.base_amount),
          cgst_amount: Number(gst.cgst_amount),
          sgst_amount: Number(gst.sgst_amount),
          igst_amount: Number(gst.igst_amount),
          total_amount: Number(gst.total_amount),
          tax_type: gst.tax_type,
        }
      : null,
  };
};

async function loadGstInvoicesForPayments(paymentRows) {
  if (!paymentRows?.length) return {};
  const ids = paymentRows.map((r) => r.id);
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM subscription_gst_invoices WHERE recurring_payment_id IN (?)`,
      [ids],
    );
    const map = {};
    for (const row of rows) {
      map[row.recurring_payment_id] = row;
    }
    return map;
  } catch (err) {
    if (err.code === "ER_NO_SUCH_TABLE") return {};
    throw err;
  }
}

/**
 * POST /admin/subscription/user-subscriptions/:id/cancel
 * Body: { cancel_at_cycle_end?: boolean } — default true
 */
export const cancelUserSubscriptionAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const cancelAtCycleEnd =
      req.body?.cancel_at_cycle_end !== false && req.body?.cancel_at_cycle_end !== 0;

    const result = await cancelUserSubscription({
      userSubscriptionId: id,
      cancelAtCycleEnd,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("cancelUserSubscriptionAdmin:", error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to cancel subscription",
    });
  }
};

/**
 * GET /admin/subscription/user-subscriptions/:id/payments
 * Stored recurring payment ledger (webhook + verify + sync).
 */
export const getUserSubscriptionPayments = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const row = await loadSubscriptionRow(id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    let payments = [];
    let summary = {};
    try {
      payments = await listPaymentsForSubscription(id);
      summary = await getPaymentSummary(id);
    } catch (dbErr) {
      if (dbErr.code === "ER_NO_SUCH_TABLE") {
        return res.status(503).json({
          success: false,
          message:
            "Payment ledger table missing. Run migrations/001_subscription_recurring_payments.sql",
        });
      }
      throw dbErr;
    }

    const gstMap = await loadGstInvoicesForPayments(payments);

    return res.status(200).json({
      success: true,
      subscription: {
        id: row.id,
        razorpay_subscription_id: row.razorpay_subscription_id,
        status: row.status,
        plan_name: row.plan_name,
        user_name: row.user_name,
        final_amount: row.final_amount,
        next_billing_date: formatDt(row.next_billing_date),
      },
      summary: {
        total_charges: Number(summary.total_charges) || 0,
        success_count: Number(summary.success_count) || 0,
        failed_count: Number(summary.failed_count) || 0,
        total_paid_inr: Number(summary.total_paid_inr) || 0,
      },
      payments: payments.map((p) => formatPaymentRow(p, gstMap)),
    });
  } catch (error) {
    console.error("getUserSubscriptionPayments:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch payments",
    });
  }
};

/**
 * POST /admin/subscription/user-subscriptions/:id/payments/sync
 * Backfill from Razorpay payments API.
 */
export const syncUserSubscriptionPayments = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const row = await loadSubscriptionRow(id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    const syncResult = await syncPaymentsFromRazorpay(row);
    const payments = await listPaymentsForSubscription(id);
    const summary = await getPaymentSummary(id);

    return res.status(200).json({
      success: true,
      sync: syncResult,
      summary: {
        total_charges: Number(summary.total_charges) || 0,
        success_count: Number(summary.success_count) || 0,
        failed_count: Number(summary.failed_count) || 0,
        total_paid_inr: Number(summary.total_paid_inr) || 0,
      },
      payments: payments.map(formatPaymentRow),
    });
  } catch (error) {
    console.error("syncUserSubscriptionPayments:", error);
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        success: false,
        message:
          "Payment ledger table missing. Run migrations/001_subscription_recurring_payments.sql",
      });
    }
    return res.status(500).json({
      success: false,
      message: error?.message || "Sync failed",
    });
  }
};

/**
 * GET /admin/subscription/user-subscriptions/:id/invoices
 * Razorpay invoices + payments for the subscription row.
 */
export const getUserSubscriptionInvoices = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const row = await loadSubscriptionRow(id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }
    const subscriptionId = row.razorpay_subscription_id;

    if (!subscriptionId) {
      return res.status(200).json({
        success: true,
        subscription: row,
        invoices: [],
        payments: [],
        message: "No Razorpay subscription id on this record",
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({
        success: false,
        message: "Razorpay is not configured on the server",
      });
    }

    const { default: razorpay } = await import("#utils/razorpayClient.js");

    let invoiceItems = [];
    let paymentItems = [];

    try {
      const invRes = await razorpay.invoices.all({
        subscription_id: subscriptionId,
        count: 50,
      });
      invoiceItems = (invRes.items || []).map((inv) => ({
        id: inv.id,
        status: inv.status,
        amount: inv.amount,
        amount_paid: inv.amount_paid,
        currency: inv.currency,
        invoice_number: inv.invoice_number,
        short_url: inv.short_url,
        created_at: inv.created_at
          ? new Date(inv.created_at * 1000).toISOString()
          : null,
        paid_at: inv.paid_at ? new Date(inv.paid_at * 1000).toISOString() : null,
      }));
    } catch (invErr) {
      console.warn("Razorpay invoices.all:", invErr?.message || invErr);
    }

    try {
      const payRes = await razorpay.payments.all({
        subscription_id: subscriptionId,
        count: 50,
      });
      paymentItems = (payRes.items || []).map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        email: p.email,
        contact: p.contact,
        invoice_id: p.invoice_id || null,
        created_at: p.created_at
          ? new Date(p.created_at * 1000).toISOString()
          : null,
      }));
    } catch (payErr) {
      console.warn("Razorpay payments.all:", payErr?.message || payErr);
    }

    let ledger = [];
    let ledgerSummary = null;
    try {
      ledger = (await listPaymentsForSubscription(id)).map(formatPaymentRow);
      ledgerSummary = await getPaymentSummary(id);
    } catch (dbErr) {
      if (dbErr.code !== "ER_NO_SUCH_TABLE") throw dbErr;
    }

    return res.status(200).json({
      success: true,
      subscription: {
        id: row.id,
        razorpay_subscription_id: subscriptionId,
        status: row.status,
        plan_name: row.plan_name,
        user_name: row.user_name,
        final_amount: row.final_amount,
        next_billing_date: formatDt(row.next_billing_date),
      },
      ledger_summary: ledgerSummary
        ? {
            total_charges: Number(ledgerSummary.total_charges) || 0,
            total_paid_inr: Number(ledgerSummary.total_paid_inr) || 0,
          }
        : null,
      ledger,
      invoices: invoiceItems,
      payments: paymentItems,
    });
  } catch (error) {
    console.error("getUserSubscriptionInvoices:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch invoices",
    });
  }
};
