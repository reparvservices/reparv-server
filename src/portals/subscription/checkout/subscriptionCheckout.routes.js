import express from "express";
import {
  createSubscriptionCheckout,
  verifySubscriptionCheckout,
  createPaymentOrderCheckout,
  verifyPaymentOrderCheckout,
} from "./subscriptionCheckout.controller.js";

const router = express.Router();

router.post("/create-subscription", createSubscriptionCheckout);
router.post("/verify-subscription", verifySubscriptionCheckout);

/** One-time order checkout (mobile / merchants without recurring enabled). */
router.post("/create-order", createPaymentOrderCheckout);
router.post("/verify-payment", verifyPaymentOrderCheckout);

export default router;
