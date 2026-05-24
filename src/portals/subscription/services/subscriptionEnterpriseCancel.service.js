import dbPromise from "#db/promise";
import { PLAN_TYPE_SELECT_SQL } from "../utils/planTypeSql.js";

async function syncLegacyInactive(role, userId) {
  if (role === "project") {
    await dbPromise.query(
      `UPDATE projectpartner SET loginstatus = 'Inactive', updated_at = NOW() WHERE id = ?`,
      [userId],
    );
  } else if (role === "territory") {
    await dbPromise.query(
      `UPDATE territorypartner SET loginstatus = 'Inactive', updated_at = NOW() WHERE id = ?`,
      [userId],
    );
  } else if (role === "sales") {
    await dbPromise.query(
      `UPDATE salespersons SET loginstatus = 'Inactive', updated_at = NOW() WHERE salespersonsid = ?`,
      [userId],
    );
  }
}

async function loadEnterpriseSubscription(userSubscriptionId) {
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

async function loadSubscriptionRowById(subId) {
  const [rows] = await dbPromise.query(
    `SELECT id, user_id, role, status, end_date, next_billing_date, razorpay_subscription_id
     FROM user_subscriptions WHERE id = ?`,
    [subId],
  );
  return rows[0] || null;
}

function isEnterpriseSubscription(sub) {
  if (!sub) return false;
  return String(sub.plan_type || "").toLowerCase() === "enterprise";
}

function buildSuccessMessage({ cancelAtCycleEnd, accessUntil }) {
  if (!cancelAtCycleEnd) {
    return "Enterprise subscription revoked immediately. Partner access has ended.";
  }
  if (accessUntil && new Date(accessUntil) > new Date()) {
    return "Enterprise subscription cancelled. Partner keeps access until the plan end date.";
  }
  return "Enterprise subscription cancelled.";
}

/**
 * Cancel admin-assigned enterprise subscriptions (no Razorpay).
 *
 * @param {object} opts
 * @param {number} opts.userSubscriptionId
 * @param {boolean} [opts.cancelAtCycleEnd] — true = access until end_date; false = revoke now
 */
export async function cancelEnterpriseSubscription({
  userSubscriptionId,
  cancelAtCycleEnd = true,
}) {
  const sub = await loadEnterpriseSubscription(userSubscriptionId);
  if (!sub) {
    const e = new Error("Subscription not found");
    e.statusCode = 404;
    throw e;
  }

  if (!isEnterpriseSubscription(sub)) {
    const e = new Error("This subscription is not an enterprise plan");
    e.statusCode = 400;
    throw e;
  }

  if (sub.razorpay_subscription_id) {
    const e = new Error("Use Razorpay cancel for recurring subscriptions");
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
  if (statusLower !== "active") {
    const e = new Error("Only active enterprise subscriptions can be cancelled");
    e.statusCode = 400;
    throw e;
  }

  const now = new Date();
  let accessUntil = sub.end_date ? new Date(sub.end_date) : null;

  if (!cancelAtCycleEnd) {
    await dbPromise.query(
      `UPDATE user_subscriptions
       SET status = 'expired',
           end_date = ?,
           next_billing_date = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [now, sub.id],
    );
    accessUntil = now;
    await syncLegacyInactive(sub.role, sub.user_id);
  } else {
    const endStillFuture = accessUntil && accessUntil > now;
    const localStatus = endStillFuture ? "cancelled" : "expired";

    await dbPromise.query(
      `UPDATE user_subscriptions
       SET status = ?,
           next_billing_date = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [localStatus, sub.id],
    );

    if (!endStillFuture) {
      accessUntil = now;
      await syncLegacyInactive(sub.role, sub.user_id);
    }
  }

  const updated = await loadSubscriptionRowById(sub.id);

  return {
    success: true,
    enterprise: true,
    cancel_at_cycle_end: Boolean(cancelAtCycleEnd),
    immediate: !cancelAtCycleEnd,
    scheduled: Boolean(cancelAtCycleEnd && accessUntil && new Date(accessUntil) > now),
    access_until: accessUntil,
    subscription: updated,
    message: buildSuccessMessage({ cancelAtCycleEnd, accessUntil }),
  };
}
