import express from "express";
import {
  verifyWebhook,
  receiveWebhook,
} from "../../controllers/webhooks/whatsappChatWebhookController.js";

const router = express.Router();

router.get("/", verifyWebhook);
router.post("/", receiveWebhook);

export default router;

