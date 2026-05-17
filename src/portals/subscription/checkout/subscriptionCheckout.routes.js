import express from "express";
import {
  createSubscriptionCheckout,
  verifySubscriptionCheckout,
} from "./subscriptionCheckout.controller.js";

const router = express.Router();

router.post("/create-subscription", createSubscriptionCheckout);
router.post("/verify-subscription", verifySubscriptionCheckout);

/** @deprecated Prefer POST /create-subscription (same handler; not Razorpay Orders API). */
router.post("/create-order", createSubscriptionCheckout);

/** @deprecated Prefer POST /verify-subscription (same handler). */
router.post("/verify-payment", verifySubscriptionCheckout);

export default router;
