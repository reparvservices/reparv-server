import express from "express";
import {
  listLeads,
  getLeadById,
  updateLeadStatus,
  listConversations,
  getConversationByUserId,
} from "../controllers/aiAgentController.js";

const router = express.Router();

router.get("/leads", listLeads);
router.get("/leads/:id", getLeadById);
router.put("/leads/:id/status", updateLeadStatus);
router.get("/conversations", listConversations);
router.get("/conversations/:userId", getConversationByUserId);

export default router;
