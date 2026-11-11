import express from "express";
import { buildPartnerSubscriptionHandler } from "../../subscription/partner/getPartnerSubscription.controller.js";
import { buildActivatePartnerTrialHandler } from "../../subscription/partner/activatePartnerTrial.controller.js";
import { buildGetPartnerTrialStatusHandler } from "../../subscription/partner/getPartnerTrialStatus.controller.js";
import { buildCancelPartnerSubscriptionHandler } from "../../subscription/partner/cancelPartnerSubscription.controller.js";
import {
  requireProjectPartner,
  requireSameProjectPartner,
} from "../../../core/middleware/verifyToken.js";
import { allowPartnerTrialActivation } from "../../../core/middleware/allowPartnerTrialActivation.js";

const router = express.Router();
const ownAccount = [requireProjectPartner, requireSameProjectPartner];

router.get("/user/:userId", ...ownAccount, buildPartnerSubscriptionHandler("project"));
router.get("/trial-status/:userId", ...ownAccount, buildGetPartnerTrialStatusHandler("project"));
router.post("/activate-trial/:userId", allowPartnerTrialActivation, buildActivatePartnerTrialHandler("project"));
router.post("/cancel/:userId", ...ownAccount, buildCancelPartnerSubscriptionHandler("project"));

export default router;
