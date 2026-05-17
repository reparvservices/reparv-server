import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";

const router = express.Router();

/** Onboarding is not in Razorpay recurring roles yet; reserved for future `user_subscriptions.role`. */
router.get("/user/:userId", buildPartnerSubscriptionHandler("onboarding"));

export default router;
