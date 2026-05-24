import dbPromise from "#db/promise";
import { isPartnerSubscriptionAccessActive } from "../utils/subscriptionAccess.js";
import { hasPartnerConsumedTrial } from "../utils/partnerTrialConsumed.js";
import { PLAN_TYPE_SELECT_SQL } from "../utils/planTypeSql.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);

/** Matches admin trial plans and legacy names like "Free Trail". */
export function isTrialPlanRecord(plan) {
  if (!plan) return false;
  const type = String(plan.plan_type || "paid").toLowerCase();
  const name = String(plan.plan_name || "").toLowerCase();
  const price = Number(plan.price);
  if (type === "trial") return true;
  if (/trial|trail/.test(name)) return true;
  if (Number.isFinite(price) && price <= 0 && /free|trial|trail/.test(name)) {
    return true;
  }
  return false;
}

function addTrialDays(startDate, days) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + Math.max(1, Number(days) || 1));
  return end;
}

async function loadLatestSubscription(userId, role) {
  const [rows] = await dbPromise.query(
    `SELECT us.*, (${PLAN_TYPE_SELECT_SQL}) AS plan_type
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ? AND us.role = ?
     ORDER BY COALESCE(us.updated_at, us.created_at) DESC, us.id DESC
     LIMIT 1`,
    [userId, role],
  );
  return rows[0] || null;
}

/**
 * Start an admin-defined free trial plan (no Razorpay).
 */
export async function activatePartnerTrial({ userId, role, planId }) {
  const uid = Number.parseInt(userId, 10);
  const pid = Number.parseInt(planId, 10);
  const roleNorm = String(role || "").toLowerCase();

  if (!VALID_ROLES.has(roleNorm) || !uid || !pid) {
    const e = new Error("userId, role, and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  const [planRows] = await dbPromise.query(
    `SELECT id, plan_name, duration, plan_type, status, price
     FROM subscription_plans
     WHERE id = ? AND role = ?`,
    [pid, roleNorm],
  );
  const plan = planRows[0];
  if (!plan) {
    const e = new Error("Trial plan not found");
    e.statusCode = 404;
    throw e;
  }
  if (!isTrialPlanRecord(plan)) {
    const e = new Error("Selected plan is not a free trial plan");
    e.statusCode = 400;
    throw e;
  }
  if (String(plan.status || "").toLowerCase() !== "active") {
    const e = new Error("Trial plan is not active");
    e.statusCode = 400;
    throw e;
  }

  const existing = await loadLatestSubscription(uid, roleNorm);
  const existingPlanType = String(existing?.plan_type || "").toLowerCase();

  if (existing && isPartnerSubscriptionAccessActive(existing)) {
    if (existingPlanType === "trial") {
      const e = new Error("You already have an active free trial.");
      e.statusCode = 400;
      throw e;
    }
    const e = new Error(
      "You already have an active paid subscription. Cancel it first or wait until it ends.",
    );
    e.statusCode = 400;
    throw e;
  }

  if (await hasPartnerConsumedTrial(uid, roleNorm)) {
    const e = new Error(
      "Free trial has already been used on this account. Choose a paid plan to continue.",
    );
    e.statusCode = 400;
    throw e;
  }

  const trialDays = Math.max(1, Number.parseInt(plan.duration, 10) || 7);
  const start = new Date();
  const end = addTrialDays(start, trialDays);

  // Always insert a new row so trial history remains in user_subscriptions.
  await dbPromise.query(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id,
        start_date, end_date, next_billing_date, status, discount_amount, final_amount,
        created_at, updated_at)
     VALUES (?, ?, ?, 'manual', NULL, ?, ?, NULL, 'active', 0, 0, NOW(), NOW())`,
    [uid, roleNorm, pid, start, end],
  );

  const updated = await loadLatestSubscription(uid, roleNorm);

  const daysLeft = Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return {
    success: true,
    message: `Free trial started. You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} of full access.`,
    trial_days: trialDays,
    plan_name: plan.plan_name,
    end_date: end,
    daysLeft,
    subscription: updated
      ? {
          id: updated.id,
          status: updated.status,
          start_date: updated.start_date,
          end_date: updated.end_date,
          plan_id: updated.plan_id,
        }
      : null,
  };
}

/**
 * Trial flags for partner apps (used by subscription / compare screens).
 */
export async function getPartnerTrialStatus({ userId, role }) {
  const uid = Number.parseInt(userId, 10);
  const roleNorm = String(role || "").toLowerCase();

  if (!VALID_ROLES.has(roleNorm) || !uid) {
    const e = new Error("Invalid user id or role");
    e.statusCode = 400;
    throw e;
  }

  const trialUsed = await hasPartnerConsumedTrial(uid, roleNorm);

  const latest = await loadLatestSubscription(uid, roleNorm);
  const end = latest?.end_date ? new Date(latest.end_date) : null;
  const now = new Date();

  let trialActive = false;
  let daysLeft = 0;

  if (
    end &&
    end > now &&
    isPartnerSubscriptionAccessActive(latest) &&
    String(latest?.plan_type || "").toLowerCase() === "trial"
  ) {
    trialActive = true;
    daysLeft = Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  return {
    success: true,
    trialUsed,
    trialActive,
    daysLeft,
  };
}
