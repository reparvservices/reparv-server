/**
 * Persist and query Razorpay subscription renewal charges (autopay).
 */
import dbPromise from "#db/promise";
import { tryGenerateInvoiceForRazorpayPayment } from "./gstInvoice.service.js";
import {
  getExpectedSubscriptionChargeAmount,
  paymentMatchesSubscriptionCharge,
} from "../utils/subscriptionChargeAmount.js";
import { mapRazorpaySubscriptionToLocalStatus } from "../utils/subscriptionStatus.js";

const paiseToRupees = (paise) => {
  const n = Number(paise);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 100) * 100) / 100;
};

const tsToDate = (unixSeconds) => {
  if (!unixSeconds) return null;
  const d = new Date(Number(unixSeconds) * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Razorpay webhooks use `{ entity: { id, ... } }` or a flat `{ id, ... }`. */
export function extractRazorpayEntity(block) {
  if (!block || typeof block !== "object") return null;
  if (block.entity && typeof block.entity === "object") return block.entity;
  if (block.id) return block;
  return null;
}

function subscriptionRowId(subRow) {
  const raw = subRow?.id ?? subRow?.ID;
  if (raw == null || raw === "") return null;
  return Number(raw);
}

async function fetchLatestPaymentForSubscription(razorpaySubscriptionId) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  const { default: razorpay } = await import("#utils/razorpayClient.js");
  const payRes = await razorpay.payments.all({
    subscription_id: razorpaySubscriptionId,
    count: 1,
  });
  return payRes.items?.[0] || null;
}

export async function findUserSubscriptionByRazorpayId(razorpaySubscriptionId) {
  const [rows] = await dbPromise.query(
    `SELECT us.*, sp.plan_name, sp.duration AS plan_duration, sp.billing_cycle
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.razorpay_subscription_id = ?
     ORDER BY
       CASE LOWER(us.status) WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       us.updated_at DESC,
       us.id DESC
     LIMIT 1`,
    [razorpaySubscriptionId],
  );
  return rows[0] || null;
}

/** Latest subscription row for a partner (used after one-time order checkout). */
export async function findUserSubscriptionByUserRole(userId, role) {
  const [rows] = await dbPromise.query(
    `SELECT us.*, sp.plan_name, sp.duration AS plan_duration, sp.billing_cycle
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ? AND us.role = ?
     ORDER BY us.updated_at DESC, us.id DESC
     LIMIT 1`,
    [userId, role],
  );
  return rows[0] || null;
}

export async function getNextChargeNumber(userSubscriptionId) {
  const [rows] = await dbPromise.query(
    `SELECT COUNT(*) AS cnt FROM subscription_recurring_payments
     WHERE user_subscription_id = ? AND status IN ('captured', 'authorized')`,
    [userSubscriptionId],
  );
  return (Number(rows[0]?.cnt) || 0) + 1;
}

/**
 * Insert or update one charge row (idempotent on razorpay_payment_id).
 */
export async function upsertRecurringPayment({
  userSubscriptionId,
  razorpayPaymentId,
  razorpayInvoiceId = null,
  razorpaySubscriptionId,
  amountPaise,
  amountRupees = null,
  currency = "INR",
  status = "captured",
  paymentMethod = null,
  billingCycleStart = null,
  billingCycleEnd = null,
  chargeNumber = null,
  source = "webhook",
  razorpayEvent = null,
  failureReason = null,
  paidAt = null,
}) {
  if (!userSubscriptionId || !razorpayPaymentId) {
    throw new Error("userSubscriptionId and razorpayPaymentId are required");
  }

  const ledgerSubscriptionRef =
    razorpaySubscriptionId || `one_time_${razorpayPaymentId}`;

  const amount =
    amountRupees != null ? Number(amountRupees) : paiseToRupees(amountPaise);
  const paise =
    amountPaise != null ? Number(amountPaise) : Math.round(amount * 100);

  let cycleNum = chargeNumber;
  if (cycleNum == null) {
    const existing = await dbPromise.query(
      `SELECT id FROM subscription_recurring_payments WHERE razorpay_payment_id = ?`,
      [razorpayPaymentId],
    );
    if (!existing[0]?.length) {
      cycleNum = await getNextChargeNumber(userSubscriptionId);
    }
  }

  await dbPromise.query(
    `INSERT INTO subscription_recurring_payments
      (user_subscription_id, razorpay_payment_id, razorpay_invoice_id, razorpay_subscription_id,
       amount, amount_paise, currency, status, payment_method,
       billing_cycle_start, billing_cycle_end, charge_number, source, razorpay_event,
       failure_reason, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       payment_method = COALESCE(VALUES(payment_method), payment_method),
       billing_cycle_start = COALESCE(VALUES(billing_cycle_start), billing_cycle_start),
       billing_cycle_end = COALESCE(VALUES(billing_cycle_end), billing_cycle_end),
       failure_reason = VALUES(failure_reason),
       paid_at = COALESCE(VALUES(paid_at), paid_at),
       razorpay_event = COALESCE(VALUES(razorpay_event), razorpay_event),
       source = VALUES(source),
       updated_at = NOW()`,
    [
      userSubscriptionId,
      razorpayPaymentId,
      razorpayInvoiceId,
      ledgerSubscriptionRef,
      amount,
      paise,
      currency,
      status,
      paymentMethod,
      billingCycleStart,
      billingCycleEnd,
      cycleNum,
      source,
      razorpayEvent,
      failureReason,
      paidAt,
    ],
  );

  const statusLower = String(status || "").toLowerCase();
  const shouldInvoice =
    ["captured", "authorized"].includes(statusLower) && source !== "sync";
  if (shouldInvoice) {
    tryGenerateInvoiceForRazorpayPayment(razorpayPaymentId).catch(() => {});
  }

  return { razorpay_payment_id: razorpayPaymentId, charge_number: cycleNum, amount };
}

/** After each successful charge, refresh subscription dates and status. */
export async function refreshSubscriptionBillingState(userSubscriptionId, rzSubscription) {
  if (!rzSubscription) return;

  const start = tsToDate(rzSubscription.current_start);
  const nextEnd = tsToDate(rzSubscription.current_end);
  let localStatus = mapRazorpaySubscriptionToLocalStatus(rzSubscription);

  const rzSubId = rzSubscription.id ? String(rzSubscription.id) : null;
  const whereSql = rzSubId
    ? "WHERE razorpay_subscription_id = ?"
    : "WHERE id = ?";
  const whereParam = rzSubId || userSubscriptionId;

  const [existing] = await dbPromise.query(
    `SELECT status FROM user_subscriptions ${whereSql} LIMIT 1`,
    [whereParam],
  );
  const currentStatus = String(existing[0]?.status || "").toLowerCase();
  if (currentStatus === "cancelled") {
    localStatus = "cancelled";
  }

  await dbPromise.query(
    `UPDATE user_subscriptions
     SET next_billing_date = ?,
         start_date = COALESCE(?, start_date),
         end_date = CASE
           WHEN ? IN ('active', 'cancelled') AND ? IS NOT NULL THEN ?
           ELSE end_date
         END,
         status = ?,
         updated_at = NOW()
     ${whereSql}`,
    [nextEnd, start, localStatus, nextEnd, nextEnd, localStatus, whereParam],
  );
}

export async function listPaymentsForSubscription(userSubscriptionId) {
  const [rows] = await dbPromise.query(
    `SELECT *
     FROM subscription_recurring_payments
     WHERE user_subscription_id = ?
     ORDER BY COALESCE(paid_at, created_at) DESC, id DESC`,
    [userSubscriptionId],
  );
  return rows;
}

export async function getPaymentSummary(userSubscriptionId) {
  const [rows] = await dbPromise.query(
    `SELECT
       COUNT(*) AS total_charges,
       SUM(CASE WHEN status IN ('captured', 'authorized') THEN 1 ELSE 0 END) AS success_count,
       SUM(CASE WHEN status IN ('failed', 'refunded') THEN 1 ELSE 0 END) AS failed_count,
       SUM(CASE WHEN status IN ('captured', 'authorized') THEN amount ELSE 0 END) AS total_paid_inr
     FROM subscription_recurring_payments
     WHERE user_subscription_id = ?`,
    [userSubscriptionId],
  );
  return rows[0] || {};
}

/** Map Razorpay payment block or entity → upsert payload */
export function paymentEntityToRecord(payment, subRow, opts = {}) {
  const entity = extractRazorpayEntity(payment) || payment || {};
  const userSubscriptionId = subscriptionRowId(subRow);
  const razorpaySubscriptionId =
    subRow?.razorpay_subscription_id || opts.razorpaySubscriptionId || null;
  const razorpayPaymentId = entity.id || entity.payment_id || null;

  return {
    userSubscriptionId,
    razorpayPaymentId,
    razorpayInvoiceId: entity.invoice_id || null,
    razorpaySubscriptionId,
    amountPaise: entity.amount,
    currency: entity.currency || "INR",
    status: entity.status || "captured",
    paymentMethod: entity.method || null,
    billingCycleStart: opts.billingCycleStart || null,
    billingCycleEnd: opts.billingCycleEnd || null,
    chargeNumber: opts.chargeNumber ?? null,
    source: opts.source || "webhook",
    razorpayEvent: opts.razorpayEvent || null,
    failureReason: entity.error_description || entity.error_reason || null,
    paidAt: tsToDate(entity.created_at),
  };
}

/** Pull all payments from Razorpay API and upsert (backfill / manual sync). */
export async function syncPaymentsFromRazorpay(userSubscriptionRow) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay is not configured on the server");
  }

  const subscriptionId = userSubscriptionRow.razorpay_subscription_id;
  if (!subscriptionId) {
    return { synced: 0, message: "No Razorpay subscription id" };
  }

  const { default: razorpay } = await import("#utils/razorpayClient.js");
  let synced = 0;

  const rzSub = await razorpay.subscriptions.fetch(subscriptionId);
  const billingCycleStart = tsToDate(rzSub.current_start);
  const billingCycleEnd = tsToDate(rzSub.current_end);

  const payRes = await razorpay.payments.all({
    subscription_id: subscriptionId,
    count: 100,
  });

  const expectedCharge = getExpectedSubscriptionChargeAmount(userSubscriptionRow);
  const items = payRes.items || [];
  let skipped = 0;
  for (const p of items) {
    const status = String(p.status || "").toLowerCase();
    if (!["captured", "authorized"].includes(status)) {
      skipped += 1;
      continue;
    }
    const paidRupees = paiseToRupees(p.amount);
    if (
      expectedCharge != null &&
      !paymentMatchesSubscriptionCharge(paidRupees, expectedCharge)
    ) {
      skipped += 1;
      continue;
    }
    await upsertRecurringPayment(
      paymentEntityToRecord(p, userSubscriptionRow, {
        billingCycleStart,
        billingCycleEnd,
        source: "sync",
        razorpayEvent: "sync",
      }),
    );
    synced += 1;
  }

  await refreshSubscriptionBillingState(subscriptionRowId(userSubscriptionRow), rzSub);

  return { synced, skipped, razorpay_status: rzSub.status };
}

export async function handleSubscriptionChargedWebhook(payload) {
  const subEntity = extractRazorpayEntity(payload?.subscription);
  if (!subEntity?.id) {
    throw new Error("Invalid subscription.charged payload: missing subscription id");
  }

  const subRow = await findUserSubscriptionByRazorpayId(subEntity.id);
  if (!subRow) {
    console.warn("[razorpay webhook] subscription.charged: unknown sub", subEntity.id);
    return { ok: false, reason: "subscription_not_found" };
  }

  let payEntity = extractRazorpayEntity(payload?.payment);
  if (!payEntity?.id) {
    payEntity = await fetchLatestPaymentForSubscription(subEntity.id);
  }
  if (!payEntity?.id) {
    console.warn(
      "[razorpay webhook] subscription.charged: no payment in payload for",
      subEntity.id,
    );
    await refreshSubscriptionBillingState(subscriptionRowId(subRow), subEntity);
    return { ok: true, reason: "no_payment_in_payload", user_subscription_id: subscriptionRowId(subRow) };
  }

  const record = paymentEntityToRecord(payEntity, subRow, {
    billingCycleStart: tsToDate(subEntity.current_start),
    billingCycleEnd: tsToDate(subEntity.current_end),
    razorpaySubscriptionId: subEntity.id,
    source: "webhook",
    razorpayEvent: "subscription.charged",
  });

  if (!record.userSubscriptionId || !record.razorpayPaymentId || !record.razorpaySubscriptionId) {
    console.error("[razorpay webhook] subscription.charged: incomplete record", {
      userSubscriptionId: record.userSubscriptionId,
      razorpayPaymentId: record.razorpayPaymentId,
      razorpaySubscriptionId: record.razorpaySubscriptionId,
      subRowKeys: subRow ? Object.keys(subRow) : [],
    });
    throw new Error("Could not build payment record from webhook payload");
  }

  await upsertRecurringPayment(record);
  await refreshSubscriptionBillingState(record.userSubscriptionId, subEntity);

  return { ok: true, user_subscription_id: record.userSubscriptionId };
}

export async function handleSubscriptionPaymentFailedWebhook(payload) {
  const subEntity = extractRazorpayEntity(payload?.subscription);
  if (!subEntity?.id) {
    throw new Error("Invalid subscription.payment_failed payload");
  }

  const subRow = await findUserSubscriptionByRazorpayId(subEntity.id);
  if (!subRow) {
    return { ok: false, reason: "subscription_not_found" };
  }

  const subId = subscriptionRowId(subRow);
  let payEntity = extractRazorpayEntity(payload?.payment);

  if (payEntity?.id) {
    const record = paymentEntityToRecord(
      { ...payEntity, status: payEntity.status || "failed" },
      subRow,
      {
        billingCycleStart: tsToDate(subEntity.current_start),
        billingCycleEnd: tsToDate(subEntity.current_end),
        razorpaySubscriptionId: subEntity.id,
        source: "webhook",
        razorpayEvent: "subscription.payment_failed",
      },
    );
    if (record.userSubscriptionId && record.razorpayPaymentId && record.razorpaySubscriptionId) {
      await upsertRecurringPayment(record);
    }
  }

  await dbPromise.query(
    `UPDATE user_subscriptions SET status = 'halted', updated_at = NOW() WHERE id = ?`,
    [subId],
  );

  return { ok: true, user_subscription_id: subId };
}

export async function handleSubscriptionStatusWebhook(payload, event) {
  const subEntity = extractRazorpayEntity(payload?.subscription);
  if (!subEntity?.id) return { ok: false, reason: "missing_subscription" };

  const subRow = await findUserSubscriptionByRazorpayId(subEntity.id);
  if (!subRow) return { ok: false, reason: "subscription_not_found" };

  const subId = subscriptionRowId(subRow);

  if (event === "subscription.cancelled") {
    await refreshSubscriptionBillingState(subId, subEntity);
    await dbPromise.query(
      `UPDATE user_subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [subId],
    );
    return { ok: true, status: "cancelled" };
  }

  let localStatus = subRow.status;
  if (event === "subscription.halted") localStatus = "halted";
  else if (event === "subscription.completed") localStatus = "expired";
  else if (event === "subscription.activated" || event === "subscription.resumed") {
    localStatus = "active";
  }

  await dbPromise.query(
    `UPDATE user_subscriptions
     SET status = ?, next_billing_date = ?, updated_at = NOW()
     WHERE id = ?`,
    [localStatus, tsToDate(subEntity.current_end), subId],
  );

  // First charge often fires subscription.activated — record payment if present
  if (event === "subscription.activated") {
    let payEntity = extractRazorpayEntity(payload?.payment);
    if (!payEntity?.id) {
      payEntity = await fetchLatestPaymentForSubscription(subEntity.id);
    }
    if (payEntity?.id) {
      try {
        const record = paymentEntityToRecord(payEntity, subRow, {
          billingCycleStart: tsToDate(subEntity.current_start),
          billingCycleEnd: tsToDate(subEntity.current_end),
          razorpaySubscriptionId: subEntity.id,
          source: "webhook",
          razorpayEvent: event,
        });
        if (record.userSubscriptionId && record.razorpayPaymentId) {
          await upsertRecurringPayment(record);
        }
      } catch (err) {
        console.warn("[razorpay webhook] subscription.activated payment log:", err.message);
      }
    }
  }

  return { ok: true, status: localStatus };
}
