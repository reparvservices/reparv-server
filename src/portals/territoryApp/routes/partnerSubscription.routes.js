import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";
import { buildActivatePartnerTrialHandler } from "../../subscription/partner/activatePartnerTrial.controller.js";

const router = express.Router();

router.get("/user/:userId", buildPartnerSubscriptionHandler("territory"));
router.post("/activate-trial/:userId", buildActivatePartnerTrialHandler("territory"));

export default router;
