import express from "express";
import {
  resendForgotPasswordOTP,
  resetPassword,
  sendForgotPasswordOTP,
  verifyForgotPasswordOTP,
} from "../controllers/forgetPasswordController.js";

const router = express.Router();

// Step 1 — send OTP to email
// POST /api/auth/forgot-password/send-otp
// Body: { email, role }
router.post("/send-otp", sendForgotPasswordOTP);

// Step 2 — verify OTP, get reset token
// POST /api/auth/forgot-password/verify-ocls
// tp
// Body: { email, role, otp }
router.post("/verify-otp", verifyForgotPasswordOTP);

// Step 3 — set new password
// POST /api/auth/forgot-password/reset
// Body: { email, role, resetToken, newPassword }
router.post("/reset", resetPassword);

// Optional — resend OTP (rate-limited to 1/min)
// POST /api/auth/forgot-password/resend-otp
// Body: { email, role }
router.post("/resend-otp", resendForgotPasswordOTP);

export default router;
