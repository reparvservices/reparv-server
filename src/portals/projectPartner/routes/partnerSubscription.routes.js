import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";
import { buildCancelPartnerSubscriptionHandler } from "../../subscription/partner/cancelPartnerSubscription.controller.js";
import { buildActivatePartnerTrialHandler } from "../../subscription/partner/activatePartnerTrial.controller.js";

const router = express.Router();

router.get("/user/:userId", buildPartnerSubscriptionHandler("project"));
router.post("/activate-trial/:userId", buildActivatePartnerTrialHandler("project"));
router.post("/cancel/:userId", buildCancelPartnerSubscriptionHandler("project"));

export default router;
