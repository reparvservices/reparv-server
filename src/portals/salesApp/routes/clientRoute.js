import express from "express";
import { addClient } from "../controllers/ClientController.js";
import {
  resetPassword,
  sendOtp,
  sendRequest,
  verifyOtp,
} from "../controllers/ProfileController.js";

const router = express.Router();

router.post("/add", addClient);
router.get("/send-otp/:id", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/partnerchange/request",sendRequest)

export default router;
