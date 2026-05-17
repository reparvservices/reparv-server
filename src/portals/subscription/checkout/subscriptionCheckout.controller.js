import {
  startPartnerRecurringSubscription,
  completePartnerRecurringSubscription,
} from "./subscriptionCheckout.service.js";

/**
 * POST /create-subscription — creates a Razorpay subscription and a pending `user_subscriptions` row.
 */
export async function createSubscriptionCheckout(req, res) {
  try {
    const result = await startPartnerRecurringSubscription(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || "Failed to create subscription",
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

/** @deprecated Use `createSubscriptionCheckout`. Kept for external importers. */
export const createOrder = createSubscriptionCheckout;

/** @deprecated Use `verifySubscriptionCheckout`. Kept for external importers. */
export const verifyPayment = verifySubscriptionCheckout;
