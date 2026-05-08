import Razorpay from "razorpay";
import crypto from "crypto";
import db from "#db";
import sendSubscriptionEmail from "#utils/subscriptionMailer.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const ROLE_MAP = {
  sales: "Sales Partner",
  territory: "Territory Partner",
  project: "Project Partner",
};

const dbQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

const safeInt = (value) => Number.parseInt(value, 10);

const addPlanDuration = (startDate, duration, billingCycle) => {
  const end = new Date(startDate);
  if (String(billingCycle).toLowerCase() === "yearly") {
    end.setFullYear(end.getFullYear() + duration);
  } else {
    end.setMonth(end.getMonth() + duration);
  }
  return end;
};

export async function createAutopaySubscription(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id);
  const localPlanId = safeInt(payload.plan_id || payload.planId);
  const paymentType = payload.payment_type === "manual" ? "manual" : "auto";
  const discountAmount = safeInt(payload.discount_amount || 0) || 0;
  const finalAmount = safeInt(payload.final_amount || 0) || 0;

  if (!["sales", "territory", "project"].includes(role) || !userId || !localPlanId) {
    const e = new Error("role, user_id and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  const planRows = await dbQuery(
    `SELECT id, plan_name, duration, price, billing_cycle, status, razorpay_plan_id
     FROM subscription_plans
     WHERE id = ? AND role = ?`,
    [localPlanId, role],
  );
  const planRow = planRows[0];

  if (!planRow) {
    const e = new Error("Plan not found");
    e.statusCode = 404;
    throw e;
  }
  if (planRow.status !== "Active") {
    const e = new Error("Plan is not active");
    e.statusCode = 400;
    throw e;
  }
  if (!planRow.razorpay_plan_id) {
    const e = new Error("Razorpay plan id missing for this plan. Re-sync plan first.");
    e.statusCode = 400;
    throw e;
  }

  const duration = Math.max(1, safeInt(planRow.duration) || 1);
  const rzSubscription = await razorpay.subscriptions.create({
    plan_id: planRow.razorpay_plan_id,
    total_count: duration,
    customer_notify: 1,
    notes: {
      local_plan_id: String(planRow.id),
      local_user_id: String(userId),
      role,
    },
  });

  const now = new Date();
  await dbQuery(
    `INSERT INTO user_subscriptions
     (user_id, role, plan_id, payment_type, razorpay_subscription_id, status, discount_amount, final_amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       payment_type = VALUES(payment_type),
       razorpay_subscription_id = VALUES(razorpay_subscription_id),
       discount_amount = VALUES(discount_amount),
       final_amount = VALUES(final_amount),
       status = 'pending',
       updated_at = NOW()`,
    [userId, role, localPlanId, paymentType, rzSubscription.id, discountAmount, finalAmount],
  );

  return {
    success: true,
    mode: "subscription",
    key: process.env.RAZORPAY_KEY_ID,
    razorpay_subscription_id: rzSubscription.id,
    status: rzSubscription.status,
    plan: {
      id: planRow.id,
      name: planRow.plan_name,
      duration: planRow.duration,
      billing_cycle: planRow.billing_cycle,
      price: planRow.price,
    },
    created_at: now,
  };
}

export async function verifyAutopaySubscription(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id);
  const localPlanId = safeInt(payload.plan_id || payload.planId);
  const paymentId = String(payload.razorpay_payment_id || "").trim();
  const subscriptionId = String(payload.razorpay_subscription_id || "").trim();
  const signature = String(payload.razorpay_signature || "").trim();
  const email = String(payload.email || "").trim();
  const coupon = payload.coupon;
  const isUsedCoupon = Boolean(payload.isUsedCoupon);
  const discountAmount = safeInt(payload.discount_amount || 0) || 0;
  const finalAmount = safeInt(payload.final_amount || 0) || 0;

  const missing = [];
  if (!["sales", "territory", "project"].includes(role)) missing.push("role");
  if (!userId) missing.push("user_id");
  if (!localPlanId) missing.push("plan_id");
  if (!paymentId) missing.push("razorpay_payment_id");
  if (!subscriptionId) missing.push("razorpay_subscription_id");
  if (!signature) missing.push("razorpay_signature");
  if (missing.length) {
    const e = new Error("Missing required fields");
    e.statusCode = 400;
    e.meta = { missingFields: missing };
    throw e;
  }

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${paymentId}|${subscriptionId}`);
  const generatedSignature = hmac.digest("hex");
  if (generatedSignature !== signature) {
    const e = new Error("Invalid signature");
    e.statusCode = 400;
    throw e;
  }

  const rzSubscription = await razorpay.subscriptions.fetch(subscriptionId);
  const planRows = await dbQuery(
    `SELECT id, plan_name, duration, price, billing_cycle
     FROM subscription_plans
     WHERE id = ? AND role = ?`,
    [localPlanId, role],
  );
  const planRow = planRows[0];
  if (!planRow) {
    const e = new Error("Plan not found");
    e.statusCode = 404;
    throw e;
  }

  const startDate = rzSubscription.current_start
    ? new Date(rzSubscription.current_start * 1000)
    : new Date();
  const nextBillingDate = rzSubscription.current_end
    ? new Date(rzSubscription.current_end * 1000)
    : null;
  const endDate = addPlanDuration(
    startDate,
    Math.max(1, safeInt(planRow.duration) || 1),
    planRow.billing_cycle,
  );
  const computedFinalAmount = finalAmount > 0 ? finalAmount : safeInt(planRow.price) || 0;

  await dbQuery(
    `INSERT INTO user_subscriptions
     (user_id, role, plan_id, payment_type, razorpay_subscription_id, start_date, next_billing_date, end_date, status, discount_amount, final_amount, updated_at)
     VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, 'active', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       razorpay_subscription_id = VALUES(razorpay_subscription_id),
       start_date = VALUES(start_date),
       next_billing_date = VALUES(next_billing_date),
       end_date = VALUES(end_date),
       status = VALUES(status),
       discount_amount = VALUES(discount_amount),
       final_amount = VALUES(final_amount),
       updated_at = NOW()`,
    [
      userId,
      role,
      localPlanId,
      subscriptionId,
      startDate,
      nextBillingDate,
      endDate,
      discountAmount,
      computedFinalAmount,
    ],
  );

  if (isUsedCoupon && coupon) {
    await dbQuery("INSERT INTO redeem_used (code, user_id) VALUES (?, ?)", [coupon, userId]);
  }

  if (email) {
    sendSubscriptionEmail(
      email,
      planRow.plan_name || ROLE_MAP[role] || role,
      planRow.duration,
      computedFinalAmount,
    ).catch((emailErr) => console.error("Subscription email error:", emailErr));
  }

  return {
    success: true,
    message: "Subscription activated successfully",
    data: {
      user_id: userId,
      role,
      plan_id: localPlanId,
      razorpay_subscription_id: subscriptionId,
      status: "active",
      start_date: startDate,
      next_billing_date: nextBillingDate,
      end_date: endDate,
    },
  };
}
