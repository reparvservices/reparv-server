import express from "express";
import {
  addMessage,
  getAllProperties,
  getCities,
  getHotDealProperties,
  getPremiumProperties,
  getProjectPartnerByContact,
} from "../controllers/projectPartnerController.js";
import {
  completePartnerJoinLead,
  getPartnerJoinLead,
  sendPartnerJoinLeadOtp,
} from "../controllers/partnerJoinLead.controller.js";

const router = express.Router();

router.get("/get/:contact", getProjectPartnerByContact);
router.get("/cities/:id", getCities);
router.post("/all-properties", getAllProperties);
router.post("/hot-deal-properties", getHotDealProperties);
router.post("/premium-properties", getPremiumProperties);
router.post("/message/add/:id", addMessage);
router.post("/join-lead/send-otp", sendPartnerJoinLeadOtp);
router.post("/join-lead/complete", completePartnerJoinLead);
router.get("/join-lead/:token", getPartnerJoinLead);

export default router;
