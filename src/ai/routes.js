import { Router } from "express";
import { getConversationHistory } from "./controller.js";

const router = Router();

router.get("/conversation-history", getConversationHistory);

export default router;
