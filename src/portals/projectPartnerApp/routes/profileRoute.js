// ─── routes/projectPartnerApp/profileRoutes.js ──────────────

import express from "express";
import multer from "multer";
import {
  deactivateUser,
  getProfileHeader,
  updateProfileHeader,
} from "../controllers/profileController.js";

const router = express.Router();

// ── Memory storage (same as your property routes) ────────────
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

// ── Multer error handler ─────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ success: false, error: "Image must be under 55MB." });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res
      .status(400)
      .json({ success: false, error: err.message || "Upload failed." });
  }
  next();
});

// ── Routes ───────────────────────────────────────────────────

// GET  /project-partner/profile/header
router.get("/", getProfileHeader);

// PUT  /project-partner/profile/header  (multipart/form-data)
router.put(
  "/edit",
  upload.fields([
    { name: "userimage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  updateProfileHeader,
);
router.put("/deactivate-user", deactivateUser);

export default router;
