import dbPromise from "#db/promise";
import { addPlanDuration } from "../utils/planDuration.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);
const VALID_BILLING_CYCLES = new Set(["monthly", "yearly"]);

const toInt = (v) => Number.parseInt(v, 10);

async function syncLegacyPaymentStatus(role, userId) {
  if (role === "project") {
    await dbPromise.query(
      `UPDATE projectpartner SET paymentstatus = 'Success', loginstatus = 'Active', updated_at = NOW() WHERE id = ?`,
      [userId],
    );
  } else if (role === "territory") {
    await dbPromise.query(
      `UPDATE territorypartner SET paymentstatus = 'Success', loginstatus = 'Active', updated_at = NOW() WHERE id = ?`,
      [userId],
    );
  } else if (role === "sales") {
    await dbPromise.query(
      `UPDATE salespersons SET paymentstatus = 'Success', loginstatus = 'Active', updated_at = NOW() WHERE salespersonsid = ?`,
      [userId],
    );
  }
}

/**
 * Admin-assign an enterprise plan to a partner (no Razorpay checkout).
 */
export async function assignEnterpriseSubscription(body = {}) {
  const userId = body.userId ?? body.user_id;
  const role = body.role;
  const planId = body.planId ?? body.plan_id;
  const planName = body.planName ?? body.plan_name;
  const billingCycle = body.billingCycle ?? body.billing_cycle;
  const finalAmount = body.finalAmount ?? body.final_amount;
  const startDate = body.startDate ?? body.start_date;

  const uid = toInt(userId);
  const r = String(role || "").toLowerCase();
  const cycle = String(billingCycle || "").toLowerCase();

  if (!uid || !VALID_ROLES.has(r)) {
    const e = new Error("Valid user_id and role are required");
    e.statusCode = 400;
    throw e;
  }

  let planRow = null;

  if (planId) {
    const [byId] = await dbPromise.query(
      `SELECT * FROM subscription_plans
       WHERE id = ? AND LOWER(plan_type) = 'enterprise' AND status = 'Active'`,
      [toInt(planId)],
    );
    planRow = byId[0];
  } else if (planName) {
    const [byName] = await dbPromise.query(
      `SELECT * FROM subscription_plans
       WHERE role = ? AND plan_name = ?
         AND LOWER(plan_type) = 'enterprise' AND status = 'Active'
       ORDER BY id ASC
       LIMIT 1`,
      [r, String(planName).trim()],
    );
    planRow = byName[0];
  }

  if (planRow && !VALID_BILLING_CYCLES.has(cycle)) {
    const e = new Error("billing_cycle must be monthly or yearly");
    e.statusCode = 400;
    throw e;
  }

  if (!planRow) {
    const e = new Error(
      "Enterprise plan not found. Provide plan_id or plan_name with role and billing_cycle.",
    );
    e.statusCode = 404;
    throw e;
  }

  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    const e = new Error("Invalid start_date");
    e.statusCode = 400;
    throw e;
  }

  const duration = Math.max(1, toInt(planRow.duration) || 1);
  const end = addPlanDuration(start, duration, cycle);
  const amount =
    finalAmount != null && Number(finalAmount) > 0
      ? Number(finalAmount)
      : Number(planRow.price) || 0;

  await dbPromise.query(
    `INSERT INTO user_subscriptions
      (user_id, role, plan_id, payment_type, razorpay_subscription_id, start_date,
       next_billing_date, end_date, status, discount_amount, final_amount, created_at, updated_at)
     VALUES (?, ?, ?, 'manual', NULL, ?, ?, ?, 'active', 0, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       payment_type = 'manual',
       razorpay_subscription_id = NULL,
       start_date = VALUES(start_date),
       next_billing_date = VALUES(next_billing_date),
       end_date = VALUES(end_date),
       status = 'active',
       discount_amount = 0,
       final_amount = VALUES(final_amount),
       updated_at = NOW()`,
    [uid, r, planRow.id, start, end, end, amount],
  );

  await syncLegacyPaymentStatus(r, uid);

  return {
    success: true,
    message: "Enterprise subscription assigned successfully",
    data: {
      user_id: uid,
      role: r,
      plan_id: planRow.id,
      plan_name: planRow.plan_name,
      billing_cycle: planRow.billing_cycle,
      plan_type: "enterprise",
      status: "active",
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      final_amount: amount,
    },
  };
}
