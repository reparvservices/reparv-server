/**
 * Razorpay Subscriptions API: create a recurring subscription and confirm the first charge.
 * Used by the public checkout mounted at `/api/subscription/payment`.
 */
import Razorpay from "razorpay";
import crypto from "crypto";
import db from "#db";
import sendSubscriptionEmail from "#utils/subscriptionMailer.js";
import {
  createRazorpayPlanForSubscriptionPlanTable,
  isRazorpayConfigured,
} from "#utils/subscriptionRazorpayPlan.js";
import { isTrialPlanRecord } from "../services/subscriptionTrial.service.js";
import {
  findUserSubscriptionByRazorpayId,
  findUserSubscriptionByUserRole,
  upsertRecurringPayment,
  paymentEntityToRecord,
} from "../services/recurringPayment.service.js";
import {
  upsertPendingRecurringRow,
  activateRecurringSubscriptionRow,
  upsertPendingOrderRow,
  activateOrderSubscriptionRow,
} from "../utils/userSubscriptionUpsert.js";

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

const httpError = (message, statusCode = 400) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

/** Plan price in rupees, always taken from the database (never from the client). */
const planAmount = (planRow) => Number(planRow.price) || 0;

/**
 * A Razorpay payment can activate only one subscription.
 * Returns true when it was already applied to this same partner (safe retry of verify);
 * throws when it was applied to someone else (replay).
 */
async function wasPaymentAlreadyApplied(paymentId, { role, userId }) {
  const rows = await dbQuery(
    `SELECT us.user_id, us.role
     FROM subscription_recurring_payments rp
     JOIN user_subscriptions us ON us.id = rp.user_subscription_id
     WHERE rp.razorpay_payment_id = ?
     LIMIT 1`,
    [paymentId],
  );
  if (!rows.length) return false;
  if (Number(rows[0].user_id) === userId && rows[0].role === role) return true;
  throw httpError("This payment has already been used", 409);
}

const alreadyAppliedResponse = (role, userId, localPlanId) => ({
  success: true,
  message: "Subscription already activated for this payment",
  data: { user_id: userId, role, plan_id: localPlanId, status: "active" },
});

/**
 * The partner and plan a checkout is for come from the Razorpay order/subscription
 * notes the server set when creating it; request values must match them.
 */
function assertCheckoutMatches(notes, { role, userId, localPlanId }) {
  const notedRole = String(notes?.role || "").toLowerCase();
  const notedUser = safeInt(notes?.local_user_id);
  const notedPlan = safeInt(notes?.local_plan_id);
  if (!notedRole || !notedUser || !notedPlan) {
    throw httpError("This payment is not a Reparv partner subscription checkout");
  }
  if (notedRole !== role || notedUser !== userId || notedPlan !== localPlanId) {
    throw httpError("Payment does not match the selected partner or plan");
  }
}

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
  if (isTrialPlanRecord(planRow)) {
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

/** Ensure `subscription_plans.razorpay_plan_id` exists and is valid in Razorpay. */
async function ensureRazorpayPlanId(planRow, role) {
  if (planRow.razorpay_plan_id) {
    try {
      await razorpay.plans.fetch(planRow.razorpay_plan_id);
      return planRow.razorpay_plan_id;
    } catch {
      console.warn(
        `Stale razorpay_plan_id for plan ${planRow.id}; creating a new Razorpay plan.`,
      );
    }
  }

  if (!isRazorpayConfigured()) {
    const e = new Error(
      "Razorpay is not configured on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
    e.statusCode = 503;
    throw e;
  }

  const synced = await createRazorpayPlanForSubscriptionPlanTable({
    role,
    planName: planRow.plan_name,
    price: planRow.price,
    billingCycle: planRow.billing_cycle,
    duration: planRow.duration,
    localPlanId: planRow.id,
  });

  if (!synced?.planId) {
    const e = new Error(
      synced?.reason ||
        "Could not create Razorpay plan for autopay. Re-save the plan in Reparv Admin.",
    );
    e.statusCode = 400;
    throw e;
  }

  await dbQuery(
    `UPDATE subscription_plans SET razorpay_plan_id = ? WHERE id = ?`,
    [synced.planId, planRow.id],
  );

  return synced.planId;
}

function parseCheckoutIdentity(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id);
  const localPlanId = safeInt(payload.plan_id || payload.planId);

  if (!["sales", "territory", "project"].includes(role) || !userId || !localPlanId) {
    const e = new Error("role, user_id and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  // discount_amount / final_amount from the client are ignored: there is no
  // coupon system and the charge must always be the plan price.
  return { role, userId, localPlanId };
}

/**
 * One-time Razorpay Order checkout (UPI, cards, etc.) — no recurring mandate required.
 */
export async function startPartnerPaymentOrder(payload) {
  const { role, userId, localPlanId } = parseCheckoutIdentity(payload);
  const planRow = await loadPaidPartnerPlan(localPlanId, role);

  const computedFinalAmount = planAmount(planRow);
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

  await upsertPendingOrderRow({
    userId,
    role,
    planId: localPlanId,
    discountAmount: 0,
    finalAmount: computedFinalAmount,
  });

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
  const { role, userId, localPlanId } = parseCheckoutIdentity(payload);
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

  if (await wasPaymentAlreadyApplied(paymentId, { role, userId })) {
    return alreadyAppliedResponse(role, userId, localPlanId);
  }

  // Partner + plan are whatever this order was created for
  const order = await razorpay.orders.fetch(orderId);
  if (order?.notes?.checkout !== "partner_subscription") {
    throw httpError("This payment is not a Reparv partner subscription checkout");
  }
  assertCheckoutMatches(order.notes, { role, userId, localPlanId });

  let payment = await razorpay.payments.fetch(paymentId);
  if (payment?.order_id !== orderId) {
    throw httpError("Payment does not belong to this order");
  }
  if (Number(payment.amount) < Number(order.amount)) {
    throw httpError("Payment amount is less than the plan price");
  }
  let payStatus = String(payment?.status || "").toLowerCase();
  if (payStatus === "authorized") {
    // Capture now; uncaptured payments are auto-refunded by Razorpay
    payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency || "INR");
    payStatus = String(payment?.status || "").toLowerCase();
  }
  if (payStatus !== "captured") {
    throw httpError(`Payment not completed (status: ${payment?.status})`);
  }

  const planRow = await loadPaidPartnerPlan(localPlanId, role);
  const startDate = new Date();
  const duration = Math.max(1, safeInt(planRow.duration) || 1);
  const endDate = addPlanDuration(startDate, duration, planRow.billing_cycle);
  const computedFinalAmount = Number(order.amount) / 100;

  await activateOrderSubscriptionRow({
    userId,
    role,
    planId: localPlanId,
    startDate,
    endDate,
    discountAmount: 0,
    finalAmount: computedFinalAmount,
  });

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

  if (!["sales", "territory", "project"].includes(role) || !userId || !localPlanId) {
    const e = new Error("role, user_id and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  const planRow = await loadPaidPartnerPlan(localPlanId, role);
  const razorpayPlanId = await ensureRazorpayPlanId(planRow, role);

  const duration = Math.max(1, safeInt(planRow.duration) || 1);
  let rzSubscription;
  try {
    rzSubscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: duration,
      customer_notify: 1,
      notes: {
        local_plan_id: String(planRow.id),
        local_user_id: String(userId),
        role,
      },
    });
  } catch (rzErr) {
    const rzMsg =
      rzErr?.error?.description ||
      rzErr?.message ||
      "Razorpay could not create subscription";
    const invalidPlan =
      /invalid|could not be found|does not exist/i.test(String(rzMsg));
    if (!invalidPlan || planRow.razorpay_plan_id === razorpayPlanId) {
      const e = new Error(rzMsg);
      e.statusCode = rzErr?.statusCode || 502;
      throw e;
    }
    const freshPlanId = await ensureRazorpayPlanId(
      { ...planRow, razorpay_plan_id: null },
      role,
    );
    rzSubscription = await razorpay.subscriptions.create({
      plan_id: freshPlanId,
      total_count: duration,
      customer_notify: 1,
      notes: {
        local_plan_id: String(planRow.id),
        local_user_id: String(userId),
        role,
      },
    });
  }

  const now = new Date();
  await upsertPendingRecurringRow({
    userId,
    role,
    planId: localPlanId,
    paymentType,
    razorpaySubscriptionId: rzSubscription.id,
    discountAmount: 0,
    finalAmount: planAmount(planRow),
  });

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

  if (await wasPaymentAlreadyApplied(paymentId, { role, userId })) {
    return alreadyAppliedResponse(role, userId, localPlanId);
  }

  const rzSubscription = await razorpay.subscriptions.fetch(subscriptionId);
  // Partner + plan are whatever this Razorpay subscription was created for
  assertCheckoutMatches(rzSubscription.notes, { role, userId, localPlanId });

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
  const computedFinalAmount = planAmount(planRow);

  await activateRecurringSubscriptionRow({
    userId,
    role,
    planId: localPlanId,
    razorpaySubscriptionId: subscriptionId,
    startDate,
    nextBillingDate,
    endDate,
    discountAmount: 0,
    finalAmount: computedFinalAmount,
  });

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
