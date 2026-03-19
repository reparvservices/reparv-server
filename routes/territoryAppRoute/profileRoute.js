import express from "express";
import {
  resetPassword,
  sendOtp,
  sendRequest,
  updateProfileHeader,
  verifyOtp,
} from "../../controllers/territoryApp/ProfileController.js";
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

router.get("/send-otp/:id", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/partnerchange/request", sendRequest);
router.put(
  "/edit",
  upload.fields([
    { name: "userimage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  updateProfileHeader,
);

export default router;
