import express from "express";
import {
  createSubscriptionCheckout,
  verifySubscriptionCheckout,
  createPaymentOrderCheckout,
  verifyPaymentOrderCheckout,
} from "./subscriptionCheckout.controller.js";
import {
  requireCheckoutIdentity,
  checkoutRateLimit,
} from "../../../core/middleware/requireCheckoutIdentity.js";

const router = express.Router();

// Mounted outside verifyToken: require a login and bind the body's user_id/role to it.
router.use(checkoutRateLimit, requireCheckoutIdentity);

router.post("/create-subscription", createSubscriptionCheckout);
router.post("/verify-subscription", verifySubscriptionCheckout);

/** One-time order checkout (mobile / merchants without recurring enabled). */
router.post("/create-order", createPaymentOrderCheckout);
router.post("/verify-payment", verifyPaymentOrderCheckout);

export default router;
