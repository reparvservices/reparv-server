import dbPromise from "#db/promise";
import { PLAN_TYPE_SELECT_SQL } from "../utils/planTypeSql.js";
import {
  upsertRecurringPayment,
  listPaymentsForSubscription,
} from "./recurringPayment.service.js";
import {
  generateInvoiceForPayment,
  getInvoiceByRecurringPaymentId,
} from "./gstInvoice.service.js";

export const ENTERPRISE_MANUAL_PAYMENT_PREFIX = "manual_ent_";

export function enterpriseManualPaymentId(userSubscriptionId) {
  return `${ENTERPRISE_MANUAL_PAYMENT_PREFIX}${userSubscriptionId}`;
}

async function loadEnterpriseSubscription(userSubscriptionId) {
  const [rows] = await dbPromise.query(
    `SELECT us.*, (${PLAN_TYPE_SELECT_SQL}) AS plan_type,
            sp.plan_name, sp.base_price AS plan_base_price,
            sp.gst_amount AS plan_gst_amount, sp.price AS plan_total_price
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.id = ?
     LIMIT 1`,
    [userSubscriptionId],
  );
  return rows[0] || null;
}

function isEnterpriseSubscription(sub) {
  if (!sub) return false;
  return String(sub.plan_type || "").toLowerCase() === "enterprise";
}

/**
 * Record admin enterprise activation in the payment ledger and ensure a GST invoice exists.
 * Idempotent per user_subscription row.
 */
export async function ensureEnterpriseActivationInvoice(userSubscriptionId) {
  const subId = Number(userSubscriptionId);
  if (!subId) {
    return { skipped: true, reason: "invalid_id" };
  }

  const sub = await loadEnterpriseSubscription(subId);
  if (!sub) {
    return { skipped: true, reason: "subscription_not_found" };
  }
  if (!isEnterpriseSubscription(sub)) {
    return { skipped: true, reason: "not_enterprise" };
  }

  if (String(sub.status || "").toLowerCase() !== "active") {
    return { skipped: true, reason: "not_active" };
  }

  const amount = Number(sub.final_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { skipped: true, reason: "zero_amount" };
  }

  const manualPaymentId = enterpriseManualPaymentId(subId);
  const [existingRows] = await dbPromise.query(
    `SELECT id FROM subscription_recurring_payments
     WHERE user_subscription_id = ? AND razorpay_payment_id = ?
     LIMIT 1`,
    [subId, manualPaymentId],
  );

  let paymentId = existingRows[0]?.id || null;
  let paymentCreated = false;

  if (!paymentId) {
    await upsertRecurringPayment({
      userSubscriptionId: subId,
      razorpayPaymentId: manualPaymentId,
      razorpaySubscriptionId: `manual_sub_${subId}`,
      amountRupees: amount,
      currency: "INR",
      status: "captured",
      paymentMethod: "manual",
      billingCycleStart: sub.start_date,
      billingCycleEnd: sub.end_date,
      chargeNumber: 1,
      source: "enterprise_assign",
      paidAt: sub.start_date || sub.created_at || new Date(),
    });

    const payments = await listPaymentsForSubscription(subId);
    const row = payments.find((p) => p.razorpay_payment_id === manualPaymentId);
    paymentId = row?.id || null;
    paymentCreated = Boolean(paymentId);
  }

  if (!paymentId) {
    return { skipped: true, reason: "payment_insert_failed" };
  }

  const existingInvoice = await getInvoiceByRecurringPaymentId(paymentId);
  if (existingInvoice) {
    return {
      success: true,
      payment_id: paymentId,
      payment_created: paymentCreated,
      invoice_created: false,
      invoice: existingInvoice,
    };
  }

  const invoiceResult = await generateInvoiceForPayment(paymentId);
  return {
    success: true,
    payment_id: paymentId,
    payment_created: paymentCreated,
    invoice_created: Boolean(invoiceResult.created),
    invoice: invoiceResult.invoice ?? existingInvoice ?? null,
    invoice_skip_reason: invoiceResult.skipped ? invoiceResult.reason : null,
  };
}
