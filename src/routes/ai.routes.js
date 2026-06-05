import { Router } from "express";
import { aiChatRateLimit } from "../ai/middleware/aiRateLimit.js";
import { requireAiPublicKey } from "../ai/middleware/aiAuth.js";
import {
  postChat,
  postWhatsApp,
  postSearchProperties,
  postLeadScore,
  getConversationByUser,
  postIndexDocument,
} from "./ai.controller.js";

const router = Router();

router.use(aiChatRateLimit);
router.use(requireAiPublicKey);

router.post("/chat", postChat);
router.post("/whatsapp", postWhatsApp);
router.post("/search-properties", postSearchProperties);
router.post("/lead-score", postLeadScore);
router.get("/conversation/:userId", getConversationByUser);
router.post("/index-document", postIndexDocument);

export default router;
