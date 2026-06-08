import { Router } from "express";
import { aiChatRateLimit } from "../ai/middleware/aiRateLimit.js";
import { requireAiPublicKey } from "../ai/middleware/aiAuth.js";
import { postChat } from "./ai.controller.js";

const router = Router();

router.use(aiChatRateLimit);
router.use(requireAiPublicKey);

router.post("/chat", postChat);

export default router;
