/**
 * Razorpay Subscriptions API: create a recurring subscription and confirm the first charge.
 * Used by the public checkout mounted at `/api/subscription/payment`.
 */
import Razorpay from "razorpay";
import crypto from "crypto";
import db from "#db";
import sendSubscriptionEmail from "#utils/subscriptionMailer.js";
import {
  findUserSubscriptionByRazorpayId,
  findUserSubscriptionByUserRole,
  upsertRecurringPayment,
  paymentEntityToRecord,
} from "../services/recurringPayment.service.js";

/** Persist payment ledger + GST invoice (same as subscription autopay verify). */
async function recordPartnerCheckoutPayment({
  paymentEntity,
  subRow,
  razorpaySubscriptionId,
  billingCycleStart,
  billingCycleEnd,
  razorpayEvent,
}) {
  if (!subRow || !paymentEntity?.id) {
    return;
  }

  const ledgerSubId =
    razorpaySubscriptionId ||
    (paymentEntity.order_id ? `order_${paymentEntity.order_id}` : null) ||
    `pay_${paymentEntity.id}`;

  await upsertRecurringPayment(
    paymentEntityToRecord(paymentEntity, subRow, {
      razorpaySubscriptionId: ledgerSubId,
      billingCycleStart,
      billingCycleEnd,
      chargeNumber: 1,
      source: "verify",
      razorpayEvent: razorpayEvent || "checkout.verify",
    }),
  );
}

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

async function loadPaidPartnerPlan(localPlanId, role) {
  const planRows = await dbQuery(
    `SELECT id, plan_name, duration, price, billing_cycle, status, razorpay_plan_id, plan_type
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
  if (String(planRow.plan_type || "paid").toLowerCase() === "trial") {
    const e = new Error(
      "This is a free trial plan. Use trial activation instead of payment checkout.",
    );
    e.statusCode = 400;
    throw e;
  }
  if (planRow.status !== "Active") {
    const e = new Error("Plan is not active");
    e.statusCode = 400;
    throw e;
  }
  return planRow;
}

function parseCheckoutIdentity(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id);
  const localPlanId = safeInt(payload.plan_id || payload.planId);
  const discountAmount = safeInt(payload.discount_amount || 0) || 0;
  const finalAmount = safeInt(payload.final_amount || 0) || 0;

  if (!["sales", "territory", "project"].includes(role) || !userId || !localPlanId) {
    const e = new Error("role, user_id and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  return { role, userId, localPlanId, discountAmount, finalAmount };
}

/**
 * One-time Razorpay Order checkout (UPI, cards, etc.) — no recurring mandate required.
 */
export async function startPartnerPaymentOrder(payload) {
  const { role, userId, localPlanId, discountAmount, finalAmount } =
    parseCheckoutIdentity(payload);
  const planRow = await loadPaidPartnerPlan(localPlanId, role);

  const computedFinalAmount =
    finalAmount > 0 ? finalAmount : safeInt(planRow.price) || 0;
  const amountPaise = Math.round(computedFinalAmount * 100);
  if (amountPaise < 100) {
    const e = new Error("Plan amount must be at least ₹1");
    e.statusCode = 400;
    throw e;
  }

  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `sub_${role}_${userId}_${localPlanId}_${Date.now()}`.slice(0, 40),
    notes: {
      checkout: "partner_subscription",
      role,
      local_plan_id: String(localPlanId),
      local_user_id: String(userId),
    },
  });

  await dbQuery(
    `INSERT INTO user_subscriptions
     (user_id, role, plan_id, payment_type, status, discount_amount, final_amount, created_at, updated_at)
     VALUES (?, ?, ?, 'manual', 'pending', ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       payment_type = 'manual',
       discount_amount = VALUES(discount_amount),
       final_amount = VALUES(final_amount),
       status = IF(LOWER(status) = 'active', 'active', 'pending'),
       updated_at = NOW()`,
    [userId, role, localPlanId, discountAmount, computedFinalAmount],
  );

  return {
    success: true,
    mode: "order",
    key: process.env.RAZORPAY_KEY_ID,
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    plan: {
      id: planRow.id,
      name: planRow.plan_name,
      duration: planRow.duration,
      billing_cycle: planRow.billing_cycle,
      price: planRow.price,
    },
  };
}

export async function completePartnerPaymentOrder(payload) {
  const { role, userId, localPlanId, discountAmount, finalAmount } =
    parseCheckoutIdentity(payload);
  const paymentId = String(payload.razorpay_payment_id || "").trim();
  const orderId = String(payload.razorpay_order_id || "").trim();
  const signature = String(payload.razorpay_signature || "").trim();
  const email = String(payload.email || "").trim();

  const missing = [];
  if (!paymentId) missing.push("razorpay_payment_id");
  if (!orderId) missing.push("razorpay_order_id");
  if (!signature) missing.push("razorpay_signature");
  if (missing.length) {
    const e = new Error("Missing required fields");
    e.statusCode = 400;
    e.meta = { missingFields: missing };
    throw e;
  }

  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest("hex");
  if (generatedSignature !== signature) {
    const e = new Error("Invalid signature");
    e.statusCode = 400;
    throw e;
  }

  const payment = await razorpay.payments.fetch(paymentId);
  const payStatus = String(payment?.status || "").toLowerCase();
  if (!["captured", "authorized"].includes(payStatus)) {
    const e = new Error(`Payment not completed (status: ${payment?.status})`);
    e.statusCode = 400;
    throw e;
  }

  const planRow = await loadPaidPartnerPlan(localPlanId, role);
  const startDate = new Date();
  const duration = Math.max(1, safeInt(planRow.duration) || 1);
  const endDate = addPlanDuration(startDate, duration, planRow.billing_cycle);
  const computedFinalAmount =
    finalAmount > 0 ? finalAmount : safeInt(planRow.price) || 0;

  await dbQuery(
    `INSERT INTO user_subscriptions
     (user_id, role, plan_id, payment_type, razorpay_subscription_id, start_date, next_billing_date, end_date, status, discount_amount, final_amount, updated_at)
     VALUES (?, ?, ?, 'manual', NULL, ?, ?, ?, 'active', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       plan_id = VALUES(plan_id),
       payment_type = 'manual',
       razorpay_subscription_id = NULL,
       start_date = VALUES(start_date),
       next_billing_date = VALUES(next_billing_date),
       end_date = VALUES(end_date),
       status = 'active',
       discount_amount = VALUES(discount_amount),
       final_amount = VALUES(final_amount),
       updated_at = NOW()`,
    [
      userId,
      role,
      localPlanId,
      startDate,
      endDate,
      endDate,
      discountAmount,
      computedFinalAmount,
    ],
  );

  try {
    const subRow = await findUserSubscriptionByUserRole(userId, role);
    if (subRow) {
      payment.order_id = payment.order_id || orderId;
      await recordPartnerCheckoutPayment({
        paymentEntity: payment,
        subRow,
        razorpaySubscriptionId: orderId ? `order_${orderId}` : null,
        billingCycleStart: startDate,
        billingCycleEnd: endDate,
        razorpayEvent: "checkout.order.verify",
      });
    }
  } catch (payLogErr) {
    console.error("Record order checkout payment:", payLogErr);
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
      status: "active",
      start_date: startDate,
      end_date: endDate,
    },
  };
}

export async function startPartnerRecurringSubscription(payload) {
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

  const planRow = await loadPaidPartnerPlan(localPlanId, role);
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
       status = IF(LOWER(status) = 'active', 'active', 'pending'),
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

export async function completePartnerRecurringSubscription(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id);
  const localPlanId = safeInt(payload.plan_id || payload.planId);
  const paymentId = String(payload.razorpay_payment_id || "").trim();
  const subscriptionId = String(payload.razorpay_subscription_id || "").trim();
  const signature = String(payload.razorpay_signature || "").trim();
  const email = String(payload.email || "").trim();
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
  // Recurring autopay: current billing period ends at Razorpay current_end
  const endDate =
    nextBillingDate ||
    addPlanDuration(
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

  try {
    const subRow = await findUserSubscriptionByRazorpayId(subscriptionId);
    if (subRow) {
      const payEntity = await razorpay.payments.fetch(paymentId);
      await recordPartnerCheckoutPayment({
        paymentEntity: payEntity,
        subRow,
        razorpaySubscriptionId: subscriptionId,
        billingCycleStart: startDate,
        billingCycleEnd: nextBillingDate,
        razorpayEvent: "checkout.verify",
      });
    }
  } catch (payLogErr) {
    console.error("Record first subscription payment:", payLogErr);
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
