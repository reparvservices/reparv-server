import express from "express";
import {
  sendterritorypartnerOtp,
  verifyterritorypartnerOtp,
} from "../../controllers/territoryApp/authController.js";

const router = express.Router();

router.post("/send-otp", sendterritorypartnerOtp);
router.post("/verify-otp", verifyterritorypartnerOtp);

export default router;
