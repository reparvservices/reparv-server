import dbPromise from "#db/promise";
import { isPartnerSubscriptionAccessActive } from "../utils/subscriptionAccess.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);

function addTrialDays(startDate, days) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + Math.max(1, Number(days) || 1));
  return end;
}

async function loadLatestSubscription(userId, role) {
  const [rows] = await dbPromise.query(
    `SELECT us.*, sp.plan_type
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

  // #region agent log
  fetch("http://127.0.0.1:7873/ingest/e030798b-abf2-42c8-b0a1-b6795e79c4b6", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ab9682" },
    body: JSON.stringify({
      sessionId: "ab9682",
      hypothesisId: "B",
      location: "subscriptionTrial.service.js:activatePartnerTrial:entry",
      message: "activatePartnerTrial called",
      data: { uid, pid, roleNorm },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!VALID_ROLES.has(roleNorm) || !uid || !pid) {
    const e = new Error("userId, role, and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  const [planRows] = await dbPromise.query(
    `SELECT id, plan_name, duration, plan_type, status
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
  if (String(plan.plan_type || "paid").toLowerCase() !== "trial") {
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
  if (existing && isPartnerSubscriptionAccessActive(existing)) {
    const e = new Error("You already have an active subscription or trial");
    e.statusCode = 400;
    throw e;
  }

  const [trialUsed] = await dbPromise.query(
    `SELECT id FROM user_subscriptions
     WHERE user_id = ? AND role = ? AND LOWER(status) = 'trial'
     LIMIT 1`,
    [uid, roleNorm],
  );
  if (trialUsed.length) {
    // #region agent log
    fetch("http://127.0.0.1:7873/ingest/e030798b-abf2-42c8-b0a1-b6795e79c4b6", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ab9682" },
      body: JSON.stringify({
        sessionId: "ab9682",
        hypothesisId: "C",
        location: "subscriptionTrial.service.js:trialUsed",
        message: "trial blocked - already used",
        data: { uid, roleNorm },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const e = new Error("Free trial has already been used for this account");
    e.statusCode = 400;
    throw e;
  }

  const trialDays = Math.max(1, Number.parseInt(plan.duration, 10) || 7);
  const start = new Date();
  const end = addTrialDays(start, trialDays);

  await dbPromise.query(
    `INSERT INTO user_subscriptions
       (user_id, role, plan_id, payment_type, razorpay_subscription_id,
        start_date, end_date, next_billing_date, status, discount_amount, final_amount,
        created_at, updated_at)
     VALUES (?, ?, ?, 'manual', NULL, ?, ?, NULL, 'trial', 0, 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       payment_type = 'manual',
       razorpay_subscription_id = NULL,
       start_date = VALUES(start_date),
       end_date = VALUES(end_date),
       next_billing_date = NULL,
       status = 'trial',
       discount_amount = 0,
       final_amount = 0,
       updated_at = NOW()`,
    [uid, roleNorm, pid, start, end],
  );

  const [updated] = await dbPromise.query(
    `SELECT id, status, start_date, end_date, plan_id
     FROM user_subscriptions
     WHERE user_id = ? AND role = ?
     LIMIT 1`,
    [uid, roleNorm],
  );

  const result = {
    success: true,
    message: `Free trial started. Access until ${end.toISOString()}.`,
    trial_days: trialDays,
    plan_name: plan.plan_name,
    end_date: end,
    subscription: updated[0] || null,
  };

  // #region agent log
  fetch("http://127.0.0.1:7873/ingest/e030798b-abf2-42c8-b0a1-b6795e79c4b6", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ab9682" },
    body: JSON.stringify({
      sessionId: "ab9682",
      hypothesisId: "E",
      location: "subscriptionTrial.service.js:success",
      message: "trial activated",
      data: {
        uid,
        planId: pid,
        status: updated[0]?.status,
        end_date: updated[0]?.end_date,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const daysLeft = Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
  result.daysLeft = daysLeft;

  return result;
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

  const [trialRows] = await dbPromise.query(
    `SELECT id FROM user_subscriptions
     WHERE user_id = ? AND role = ? AND LOWER(status) = 'trial'
     LIMIT 1`,
    [uid, roleNorm],
  );
  const trialUsed = trialRows.length > 0;

  const latest = await loadLatestSubscription(uid, roleNorm);
  const statusLower = String(latest?.status || "").toLowerCase();
  const end = latest?.end_date ? new Date(latest.end_date) : null;
  const now = new Date();

  let trialActive = false;
  let daysLeft = 0;

  if (
    statusLower === "trial" &&
    end &&
    end > now &&
    isPartnerSubscriptionAccessActive(latest)
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
