import {
  startPartnerRecurringSubscription,
  completePartnerRecurringSubscription,
  startPartnerPaymentOrder,
  completePartnerPaymentOrder,
} from "./subscriptionCheckout.service.js";

/**
 * POST /create-subscription — creates a Razorpay subscription and a pending `user_subscriptions` row.
 */
export async function createSubscriptionCheckout(req, res) {
  try {
    const result = await startPartnerRecurringSubscription(req.body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("createSubscriptionCheckout:", error?.message || error);
    const message =
      error?.error?.description ||
      error?.message ||
      "Failed to create subscription";
    return res.status(error?.statusCode || 500).json({
      success: false,
      message,
      ...(error?.meta || {}),
    });
  }
}

/**
 * POST /verify-subscription — validates the Razorpay signature and activates the subscription.
 */
export async function verifySubscriptionCheckout(req, res) {
  try {
    const result = await completePartnerRecurringSubscription(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to verify subscription",
      ...(error?.meta || {}),
    });
  }
}

/** POST /create-order — one-time Razorpay Order (UPI/cards; no recurring mandate). */
export async function createPaymentOrderCheckout(req, res) {
  try {
    const result = await startPartnerPaymentOrder(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to create payment order",
      ...(error?.meta || {}),
    });
  }
}

/** POST /verify-payment — confirm one-time order and activate subscription. */
export async function verifyPaymentOrderCheckout(req, res) {
  try {
    const result = await completePartnerPaymentOrder(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to verify payment",
      ...(error?.meta || {}),
    });
  }
}

export const createOrder = createPaymentOrderCheckout;
export const verifyPayment = verifyPaymentOrderCheckout;
