/**
 * Cancel Razorpay recurring subscriptions and sync local user_subscriptions row.
 *
 * - cancelAtCycleEnd true  → stop renewal; status cancelled; access until end_date (month end)
 * - cancelAtCycleEnd false → cancel now; status expired; end_date = now; access revoked
 */
import dbPromise from "#db/promise";
import razorpay from "#utils/razorpayClient.js";
import { refreshSubscriptionBillingState } from "./recurringPayment.service.js";
import { cancelEnterpriseSubscription } from "./subscriptionEnterpriseCancel.service.js";
import { PLAN_TYPE_SELECT_SQL } from "../utils/planTypeSql.js";

const tsToDate = (unixSeconds) => {
  if (!unixSeconds) return null;
  const d = new Date(Number(unixSeconds) * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
};

const RAZORPAY_TERMINAL = new Set(["completed", "cancelled", "expired"]);

function razorpayErrorMessage(err) {
  return (
    err?.error?.description ||
    err?.description ||
    err?.message ||
    "Razorpay request failed"
  );
}

function isAlreadyEndedRazorpayError(err) {
  const msg = razorpayErrorMessage(err).toLowerCase();
  return (
    msg.includes("not cancellable") ||
    msg.includes("completed status") ||
    msg.includes("already cancelled") ||
    msg.includes("already expired")
  );
}

/** Apply local DB state after Razorpay cancel (or when Razorpay already ended). */
async function applyLocalCancelState(subId, rzSub, { cancelAtCycleEnd }) {
  const now = new Date();

  if (!cancelAtCycleEnd) {
    await dbPromise.query(
      `UPDATE user_subscriptions
       SET status = 'expired',
           end_date = ?,
           next_billing_date = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [now, subId],
    );
    return { localStatus: "expired", accessUntil: now, immediate: true };
  }

  const periodEnd = tsToDate(rzSub?.current_end);
  const nowSec = Math.floor(Date.now() / 1000);
  const inPaidPeriod = Number(rzSub?.current_end) > nowSec;
  const localStatus = inPaidPeriod ? "cancelled" : "expired";

  await dbPromise.query(
    `UPDATE user_subscriptions
     SET status = ?,
         end_date = COALESCE(?, end_date),
         next_billing_date = COALESCE(?, next_billing_date),
         updated_at = NOW()
     WHERE id = ?`,
    [localStatus, periodEnd, periodEnd, subId],
  );

  return { localStatus, accessUntil: periodEnd, immediate: false };
}

async function loadSubscription({ userId, role, userSubscriptionId }) {
  if (userSubscriptionId) {
    const [rows] = await dbPromise.query(
      `SELECT us.*, (${PLAN_TYPE_SELECT_SQL}) AS plan_type
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.id = ?
       LIMIT 1`,
      [userSubscriptionId],
    );
    return rows[0] || null;
  }
  const [rows] = await dbPromise.query(
    `SELECT * FROM user_subscriptions
     WHERE user_id = ? AND role = ?
     ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
     LIMIT 1`,
    [userId, role],
  );
  return rows[0] || null;
}

async function loadSubscriptionRowById(subId) {
  const [rows] = await dbPromise.query(
    `SELECT id, user_id, role, status, end_date, next_billing_date, razorpay_subscription_id
     FROM user_subscriptions WHERE id = ?`,
    [subId],
  );
  return rows[0] || null;
}

function buildSuccessMessage({ cancelAtCycleEnd, synced, alreadyEnded }) {
  if (!cancelAtCycleEnd) {
    return "Subscription cancelled immediately. Partner access has ended.";
  }
  if (synced.localStatus === "cancelled" && synced.accessUntil) {
    const end = new Date(synced.accessUntil);
    if (end > new Date()) {
      return alreadyEnded
        ? "Autopay stopped. Marked as cancelled — partner keeps access until the billing period ends."
        : "Subscription will end at the close of the current billing period. Partner keeps access until then.";
    }
  }
  return "Subscription cancelled at the end of the billing period.";
}

/**
 * @param {object} opts
 * @param {number} [opts.userId]
 * @param {string} [opts.role]
 * @param {number} [opts.userSubscriptionId]
 * @param {boolean} [opts.cancelAtCycleEnd] — true = after month/period end; false = now
 */
export async function cancelUserSubscription({
  userId,
  role,
  userSubscriptionId = null,
  cancelAtCycleEnd = true,
}) {
  const sub = await loadSubscription({ userId, role, userSubscriptionId });
  if (!sub) {
    const e = new Error("Subscription not found");
    e.statusCode = 404;
    throw e;
  }

  const rzSubId = sub.razorpay_subscription_id;
  if (!rzSubId) {
    const planType = String(sub.plan_type || "").toLowerCase();
    if (planType === "enterprise") {
      return cancelEnterpriseSubscription({
        userSubscriptionId: sub.id,
        cancelAtCycleEnd,
      });
    }
    if (String(sub.payment_type || "").toLowerCase() === "apple") {
      return {
        success: true,
        message:
          "Apple subscriptions are managed in iOS Settings → Apple ID → Subscriptions.",
        provider: "apple",
        cancel_via_app_store: true,
      };
    }
    const e = new Error("No Razorpay subscription linked to this record");
    e.statusCode = 400;
    throw e;
  }

  const statusLower = String(sub.status || "").toLowerCase();
  if (statusLower === "cancelled") {
    const e = new Error("Subscription is already cancelled");
    e.statusCode = 400;
    throw e;
  }
  if (statusLower === "expired") {
    const e = new Error("Subscription is already expired");
    e.statusCode = 400;
    throw e;
  }

  let rzSub;
  try {
    rzSub = await razorpay.subscriptions.fetch(rzSubId);
  } catch (fetchErr) {
    const e = new Error(razorpayErrorMessage(fetchErr));
    e.statusCode = fetchErr?.statusCode || 502;
    throw e;
  }

  const rzStatus = String(rzSub.status || "").toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const inPaidPeriod = Number(rzSub.current_end) > nowSec;

  if (RAZORPAY_TERMINAL.has(rzStatus)) {
    const synced = await applyLocalCancelState(sub.id, rzSub, { cancelAtCycleEnd });
    const updated = await loadSubscriptionRowById(sub.id);

    return {
      success: true,
      already_ended_on_razorpay: true,
      cancel_at_cycle_end: Boolean(cancelAtCycleEnd),
      immediate: !cancelAtCycleEnd,
      scheduled: Boolean(cancelAtCycleEnd && inPaidPeriod),
      razorpay_status: rzSub.status,
      access_until: synced.accessUntil,
      subscription: updated,
      message: buildSuccessMessage({
        cancelAtCycleEnd,
        synced,
        alreadyEnded: true,
      }),
    };
  }

  let rzCancelled = rzSub;
  try {
    rzCancelled = await razorpay.subscriptions.cancel(rzSubId, {
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    });
  } catch (cancelErr) {
    if (!isAlreadyEndedRazorpayError(cancelErr)) {
      const e = new Error(razorpayErrorMessage(cancelErr));
      e.statusCode = cancelErr?.statusCode || 400;
      throw e;
    }
    try {
      rzCancelled = await razorpay.subscriptions.fetch(rzSubId);
    } catch {
      rzCancelled = rzSub;
    }
    const synced = await applyLocalCancelState(sub.id, rzCancelled, { cancelAtCycleEnd });
    const updated = await loadSubscriptionRowById(sub.id);
    return {
      success: true,
      already_ended_on_razorpay: true,
      cancel_at_cycle_end: Boolean(cancelAtCycleEnd),
      immediate: !cancelAtCycleEnd,
      scheduled: Boolean(cancelAtCycleEnd && inPaidPeriod),
      razorpay_status: rzCancelled.status,
      access_until: synced.accessUntil,
      subscription: updated,
      message: buildSuccessMessage({
        cancelAtCycleEnd,
        synced,
        alreadyEnded: true,
      }),
    };
  }

  if (cancelAtCycleEnd) {
    await refreshSubscriptionBillingState(sub.id, rzCancelled);
  }

  const synced = await applyLocalCancelState(sub.id, rzCancelled, { cancelAtCycleEnd });
  const updated = await loadSubscriptionRowById(sub.id);

  const stillInPaidPeriod =
    cancelAtCycleEnd && Number(rzCancelled.current_end) > nowSec;

  return {
    success: true,
    cancel_at_cycle_end: Boolean(cancelAtCycleEnd),
    immediate: !cancelAtCycleEnd,
    scheduled: Boolean(stillInPaidPeriod),
    razorpay_status: rzCancelled.status,
    access_until: synced.accessUntil,
    subscription: updated,
    message: buildSuccessMessage({ cancelAtCycleEnd, synced, alreadyEnded: false }),
  };
}
