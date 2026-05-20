import express from "express";
import { getPlansByPartnerType } from "../admin/controllers/subscriptionPlan.controller.js";

const router = express.Router();

/** Active plans for a partner label (e.g. `Project%20Partner`) — public read for apps. */
router.get("/:partnerType", getPlansByPartnerType);

export default router;
