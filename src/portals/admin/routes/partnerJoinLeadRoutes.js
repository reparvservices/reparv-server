import express from "express";
import { getPartnerJoinLeads } from "../controllers/partnerJoinLead.controller.js";

const router = express.Router();

router.get("/", getPartnerJoinLeads);

export default router;
