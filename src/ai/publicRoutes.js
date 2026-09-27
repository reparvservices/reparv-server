import { Router } from "express";
import { postAgentChat, postAgentChatStream } from "./controller.js";
import { requireAiPublicKey } from "./middleware/auth.js";
import { aiChatRateLimit } from "./middleware/rateLimit.js";

const router = Router();

// Public and costly (OpenAI calls), so rate-limited per IP
router.post("/chat", aiChatRateLimit, requireAiPublicKey, postAgentChat);
router.post("/chat/stream", aiChatRateLimit, requireAiPublicKey, postAgentChatStream);

export default router;
