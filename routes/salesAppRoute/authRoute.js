import express from "express";
import { loginUser } from "../../controllers/salesApp/ProfileController.js";
import {
  sendsalespersonsOtp,
  verifysalespersonsOtp,
} from "../../controllers/salesApp/authController.js";

const router = express.Router();

router.post("/login", loginUser);

router.post("/send-otp", sendsalespersonsOtp);
router.post("/verify-otp", verifysalespersonsOtp);

export default router;
