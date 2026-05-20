import express from "express";
import { receiveRazorpayWebhook } from "../controllers/razorpayWebhookController.js";

const router = express.Router();

router.post("/", receiveRazorpayWebhook);

export default router;
