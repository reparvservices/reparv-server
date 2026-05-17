import crypto from "crypto";
import {
  handleSubscriptionChargedWebhook,
  handleSubscriptionPaymentFailedWebhook,
  handleSubscriptionStatusWebhook,
} from "../../subscription/services/recurringPayment.service.js";

function resolveWebhookSecret() {
  return (
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    ""
  ).trim();
}

function verifySignature(rawBody, signature) {
  const secret = resolveWebhookSecret();
  if (!secret) {
    console.warn("[razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping verify");
    return true;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

/**
 * POST /webhooks/razorpay
 * Must use express.raw() on this route (mounted before express.json).
 */
export const receiveRazorpayWebhook = async (req, res) => {
  try {
    const rawBody =
      Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.headers["x-razorpay-signature"];

    if (!verifySignature(rawBody, signature)) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const eventName = event.event;
    const payload = event.payload || {};

    let result = { ok: true, event: eventName, handled: false };

    switch (eventName) {
      case "subscription.charged":
        result = { ...(await handleSubscriptionChargedWebhook(payload)), handled: true };
        break;
      case "subscription.payment_failed":
        result = {
          ...(await handleSubscriptionPaymentFailedWebhook(payload)),
          handled: true,
        };
        break;
      case "subscription.cancelled":
      case "subscription.halted":
      case "subscription.completed":
      case "subscription.activated":
      case "subscription.resumed":
        result = {
          ...(await handleSubscriptionStatusWebhook(payload, eventName)),
          handled: true,
        };
        break;
      default:
        result = { ok: true, event: eventName, handled: false, note: "ignored" };
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("[razorpay webhook]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Webhook processing failed",
    });
  }
};
