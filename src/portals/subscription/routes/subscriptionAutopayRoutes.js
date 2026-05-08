import express from "express";
import {
  createOrder,
  verifyPayment,
} from "../controllers/subscriptionAutopayController.js";

const router = express.Router();

// Legacy endpoints kept for backward compatibility.
router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

// Clear endpoints for autopay subscription flow.
router.post("/create-subscription", createOrder);
router.post("/verify-subscription", verifyPayment);

export default router;
