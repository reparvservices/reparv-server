/**
 * Apple In-App Purchase verification for iOS partner subscriptions.
 * Razorpay checkout paths are unchanged — this module is iOS-only.
 */
import db from "#db";
import sendSubscriptionEmail from "#utils/subscriptionMailer.js";
import {
  fetchAppleTransaction,
  isAppleIapConfigured,
} from "#utils/appleAppStoreClient.js";
import { isTrialPlanRecord } from "./subscriptionTrial.service.js";
import { activateAppleSubscriptionRow } from "../utils/userSubscriptionUpsert.js";
import { ensureAppleIapSchema } from "./appleIapSchema.service.js";
import { resolveAppleProductIdFromPlanName } from "../utils/applePartnerProducts.js";

const VALID_ROLES = new Set(["sales", "territory", "project"]);

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
    `SELECT id, plan_name, duration, price, billing_cycle, status, apple_product_id, plan_type
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
  if (String(planRow.status || "").toLowerCase() !== "active") {
    const e = new Error("Plan is not active");
    e.statusCode = 400;
    throw e;
  }
  if (isTrialPlanRecord(planRow)) {
    const e = new Error("Use trial activation for free trial plans");
    e.statusCode = 400;
    throw e;
  }

  const appleProductId =
    planRow.apple_product_id ||
    resolveAppleProductIdFromPlanName(planRow.plan_name, null);

  if (!appleProductId) {
    const e = new Error("This plan is not configured for iOS In-App Purchase yet");
    e.statusCode = 400;
    throw e;
  }

  return { ...planRow, apple_product_id: appleProductId };
}

function parseCheckoutIdentity(payload) {
  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id ?? payload.userId);
  const localPlanId = safeInt(payload.plan_id ?? payload.planId);

  if (!VALID_ROLES.has(role) || !userId || !localPlanId) {
    const e = new Error("role, user_id and plan_id are required");
    e.statusCode = 400;
    throw e;
  }

  return { role, userId, localPlanId };
}

async function findSubscriptionByAppleOriginalId(originalTransactionId) {
  if (!originalTransactionId) return null;
  const rows = await dbQuery(
    `SELECT id, status, user_id, role, plan_id
     FROM user_subscriptions
     WHERE apple_original_transaction_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [originalTransactionId],
  );
  return rows[0] || null;
}

function assertAppleTransactionMatchesPlan(tx, planRow) {
  const expectedBundle = process.env.APPLE_BUNDLE_ID?.trim();
  if (expectedBundle && tx.bundleId && tx.bundleId !== expectedBundle) {
    const e = new Error("Transaction bundle ID does not match this app");
    e.statusCode = 400;
    throw e;
  }

  if (tx.productId !== planRow.apple_product_id) {
    const e = new Error("Transaction product does not match the selected plan");
    e.statusCode = 400;
    throw e;
  }

  if (tx.revocationDate) {
    const e = new Error("This purchase has been refunded or revoked");
    e.statusCode = 400;
    throw e;
  }

  const now = new Date();
  if (tx.expiresDate && tx.expiresDate < now) {
    const e = new Error("This subscription has expired");
    e.statusCode = 400;
    throw e;
  }
}

export async function verifyApplePartnerPurchase(payload) {
  await ensureAppleIapSchema();

  if (!isAppleIapConfigured()) {
    const e = new Error("Apple IAP verification is not configured on the server");
    e.statusCode = 503;
    throw e;
  }

  const { role, userId, localPlanId } = parseCheckoutIdentity(payload);
  const transactionId = String(
    payload.transaction_id ?? payload.transactionId ?? "",
  ).trim();
  const environment = payload.environment || payload.apple_environment;

  if (!transactionId) {
    const e = new Error("transaction_id is required");
    e.statusCode = 400;
    throw e;
  }

  const planRow = await loadPaidPartnerPlan(localPlanId, role);
  const tx = await fetchAppleTransaction(transactionId, environment);
  assertAppleTransactionMatchesPlan(tx, planRow);

  const existing = await findSubscriptionByAppleOriginalId(tx.originalTransactionId);
  if (existing && Number(existing.user_id) !== userId) {
    const e = new Error("This Apple subscription is already linked to another account");
    e.statusCode = 409;
    throw e;
  }

  const startDate = tx.purchaseDate || new Date();
  const duration = Math.max(1, safeInt(planRow.duration) || 1);
  const fallbackEnd = addPlanDuration(startDate, duration, planRow.billing_cycle);
  const endDate =
    tx.expiresDate && !Number.isNaN(tx.expiresDate.getTime())
      ? tx.expiresDate
      : fallbackEnd;

  const subId = await activateAppleSubscriptionRow({
    userId,
    role,
    planId: localPlanId,
    startDate,
    endDate,
    finalAmount: safeInt(planRow.price) || 0,
    appleOriginalTransactionId: tx.originalTransactionId,
    appleProductId: tx.productId,
  });

  try {
    const email = String(payload.email || "").trim();
    if (email) {
      sendSubscriptionEmail(
        email,
        planRow.plan_name,
        planRow.duration,
        planRow.price,
      ).catch((mailErr) =>
        console.warn("appleIap verify: subscription email failed:", mailErr?.message),
      );
    }
  } catch (mailErr) {
    console.warn("appleIap verify: subscription email failed:", mailErr?.message);
  }

  return {
    success: true,
    mode: "apple_iap",
    subscription_id: subId,
    plan: {
      id: planRow.id,
      name: planRow.plan_name,
      duration: planRow.duration,
      billing_cycle: planRow.billing_cycle,
      price: planRow.price,
    },
    apple: {
      transaction_id: tx.transactionId,
      original_transaction_id: tx.originalTransactionId,
      product_id: tx.productId,
      expires_at: endDate.toISOString(),
    },
  };
}

export async function restoreApplePartnerPurchase(payload) {
  await ensureAppleIapSchema();

  if (!isAppleIapConfigured()) {
    const e = new Error("Apple IAP verification is not configured on the server");
    e.statusCode = 503;
    throw e;
  }

  const role = String(payload.role || "").toLowerCase();
  const userId = safeInt(payload.user_id ?? payload.userId);
  const transactionId = String(
    payload.transaction_id ?? payload.transactionId ?? "",
  ).trim();
  const productId = String(payload.product_id ?? payload.productId ?? "").trim();
  const environment = payload.environment || payload.apple_environment;

  if (!VALID_ROLES.has(role) || !userId) {
    const e = new Error("role and user_id are required");
    e.statusCode = 400;
    throw e;
  }
  if (!transactionId) {
    const e = new Error("transaction_id is required for restore");
    e.statusCode = 400;
    throw e;
  }

  const tx = await fetchAppleTransaction(transactionId, environment);
  if (tx.revocationDate) {
    return { success: false, active: false, message: "Purchase was refunded" };
  }

  const now = new Date();
  if (tx.expiresDate && tx.expiresDate < now) {
    return { success: false, active: false, message: "Subscription has expired" };
  }

  const planRows = await dbQuery(
    `SELECT id, plan_name, duration, price, billing_cycle, role, apple_product_id, plan_type, status
     FROM subscription_plans
     WHERE apple_product_id = ? AND role = ?`,
    [tx.productId || productId, role],
  );
  const planRow = planRows[0];
  if (!planRow) {
    const e = new Error("No matching plan found for this Apple product");
    e.statusCode = 404;
    throw e;
  }

  const existing = await findSubscriptionByAppleOriginalId(tx.originalTransactionId);
  if (existing && Number(existing.user_id) !== userId) {
    const e = new Error("This Apple subscription belongs to another account");
    e.statusCode = 409;
    throw e;
  }

  const startDate = tx.purchaseDate || new Date();
  const endDate = tx.expiresDate || addPlanDuration(startDate, planRow.duration, planRow.billing_cycle);

  await activateAppleSubscriptionRow({
    userId,
    role,
    planId: planRow.id,
    startDate,
    endDate,
    finalAmount: safeInt(planRow.price) || 0,
    appleOriginalTransactionId: tx.originalTransactionId,
    appleProductId: tx.productId,
  });

  return {
    success: true,
    active: true,
    plan_id: planRow.id,
    plan_name: planRow.plan_name,
    end_date: endDate.toISOString(),
  };
}
