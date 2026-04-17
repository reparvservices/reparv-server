import express from "express";
import {
  sendUserOtp,
  verifyUserOtp,
} from "../controllers/authContoller.js";
const router = express.Router();

//Send OTP
router.post("/send-otp", sendUserOtp);

// Verify OTP
router.post("/verify-otp", verifyUserOtp);

export default router;
