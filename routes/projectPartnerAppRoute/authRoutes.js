import express from "express";
import {
  sendProjectPartnerOtp,
  verifyProjectPartnerOtp,
} from "../../controllers/projectPartnerApp/authController.js";

const router = express.Router();

router.post("/send-otp", sendProjectPartnerOtp);
router.post("/verify-otp", verifyProjectPartnerOtp);

export default router;
