import express from "express";
import {
  listConversations,
  getMessages,
  sendMessage,
} from "../controllers/whatsappChatController.js";

const router = express.Router();

router.get("/conversations", listConversations);
router.get("/messages", getMessages);
router.post("/send", sendMessage);

export default router;

