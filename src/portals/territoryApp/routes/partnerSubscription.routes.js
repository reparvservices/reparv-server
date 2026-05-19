import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";
import { buildActivatePartnerTrialHandler } from "../../subscription/partner/activatePartnerTrial.controller.js";
import { buildGetPartnerTrialStatusHandler } from "../../subscription/partner/getPartnerTrialStatus.controller.js";

const router = express.Router();

router.get("/user/:userId", buildPartnerSubscriptionHandler("territory"));
router.get("/trial-status/:userId", buildGetPartnerTrialStatusHandler("territory"));
router.post("/activate-trial/:userId", buildActivatePartnerTrialHandler("territory"));

export default router;
