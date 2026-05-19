import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";
import { buildActivatePartnerTrialHandler } from "../../subscription/partner/activatePartnerTrial.controller.js";
import { buildGetPartnerTrialStatusHandler } from "../../subscription/partner/getPartnerTrialStatus.controller.js";

const router = express.Router();

router.get("/user/:userId", buildPartnerSubscriptionHandler("sales"));
router.get("/trial-status/:userId", buildGetPartnerTrialStatusHandler("sales"));
router.post("/activate-trial/:userId", buildActivatePartnerTrialHandler("sales"));

export default router;
