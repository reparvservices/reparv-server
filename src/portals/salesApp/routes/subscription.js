import express from "express";

import Razorpay from "razorpay";
import db from "#db";
import {
  createSubscription,
  getUserSubscription,
  markRedeemUsed,
  validateRedeemCode,
} from "../controllers/subscriptionController.js";

const router = express.Router();

router.post("/create", createSubscription);
router.get("/user/:userId", getUserSubscription);
router.post("/validate", validateRedeemCode);
router.post("/mark-used", markRedeemUsed);

export default router;
