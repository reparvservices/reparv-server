import express from "express";
import {
  verifyWebhook,
  handleWebhook,
} from "../../controllers/metacontroller/metalead.controller.js";

const router = express.Router();

router.get("/webhook", verifyWebhook);
router.post("/webhook", handleWebhook);

export default router;
