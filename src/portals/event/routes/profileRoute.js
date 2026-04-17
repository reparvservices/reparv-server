import express from "express";
import {
  getUserProfile,
  editProfile,
  requestMobileChangeOtp,
  verifyMobileChangeOtp,
} from "../controllers/profileController.js";

const router = express.Router();

// Get profile
router.get("/:id", getUserProfile);

// Edit profile (name, role, company, image)
router.put("/:id", editProfile);

// Change mobile — Step 1: request OTP to new number
router.post("/:id/request-mobile-otp", requestMobileChangeOtp);

// Change mobile — Step 2: verify OTP and update number
router.post("/:id/verify-mobile-otp", verifyMobileChangeOtp);

export default router;
