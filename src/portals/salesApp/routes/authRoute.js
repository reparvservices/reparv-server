import express from "express";
import multer from "multer";

import {
  loginUser,
  updateProfileHeader,
} from "../controllers/ProfileController.js";
import {
  add,
  sendsalespersonsOtp,
  verifysalespersonsOtp,
} from "../controllers/authController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 55 * 1024 * 1024 }, // 55MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only WEBP, JPEG, PNG, and JPG images are allowed"));
    }

    cb(null, true);
  },
});

// ---------------- ROUTES ----------------

// register sales partner
router.post(
  "/register",
  upload.fields([{ name: "profileImage", maxCount: 1 }]),
  add,
);

router.put(
  "/edit",
  upload.fields([
    { name: "userimage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  updateProfileHeader,
);

// login
router.post("/login", loginUser);

// OTP routes
router.post("/send-otp", sendsalespersonsOtp);
router.post("/verify-otp", verifysalespersonsOtp);

export default router;
