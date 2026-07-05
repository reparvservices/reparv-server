import express from "express";
import {
  createSubscriptionCheckout,
  verifySubscriptionCheckout,
  createPaymentOrderCheckout,
  verifyPaymentOrderCheckout,
} from "./subscriptionCheckout.controller.js";
import {
  verifyApplePurchaseCheckout,
  restoreApplePurchaseCheckout,
  listApplePartnerProducts,
} from "./appleIap.controller.js";

const router = express.Router();

router.post("/create-subscription", createSubscriptionCheckout);
router.post("/verify-subscription", verifySubscriptionCheckout);

/** One-time order checkout (mobile / merchants without recurring enabled). */
router.post("/create-order", createPaymentOrderCheckout);
router.post("/verify-payment", verifyPaymentOrderCheckout);

/** iOS In-App Purchase (Android continues to use Razorpay routes above). */
router.get("/apple/products", listApplePartnerProducts);
router.post("/apple/verify", verifyApplePurchaseCheckout);
router.post("/apple/restore", restoreApplePurchaseCheckout);

export default router;
