import express from "express";
import multer from "multer";
import { submitEmiForm } from "../../controllers/user/emiController.js";

const router = express.Router();

/* =========================
   Multer Configuration (S3)
   → memoryStorage ONLY
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG & PNG files are allowed"), false);
    }
    cb(null, true);
  },
});

/* =========================
   Route
========================= */
router.post(
  "/check-eligibility",
  upload.fields([
    { name: "panImage", maxCount: 1 },
    { name: "aadhaarFrontImage", maxCount: 1 },
    { name: "aadhaarBackImage", maxCount: 1 },
  ]),
  submitEmiForm
);

export default router;