import { Router } from "express";
import { postAgentChat } from "./controller.js";
import { requireAiPublicKey } from "./middleware/auth.js";

const router = Router();

router.post("/chat", requireAiPublicKey, postAgentChat);

export default router;
