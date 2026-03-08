import express from "express";
import {
  add,
  sendterritorypartnerOtp,
  verifyterritorypartnerOtp,
} from "../../controllers/territoryApp/authController.js";
import multer from "multer";

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
// ------------- ROUTES ----------------

// register sales partner
router.post(
  "/register",
  upload.fields([{ name: "profileImage", maxCount: 1 }]),
  add,
);

router.post("/send-otp", sendterritorypartnerOtp);
router.post("/verify-otp", verifyterritorypartnerOtp);

export default router;
