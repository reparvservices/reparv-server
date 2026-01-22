import express from "express";
import multer from "multer";
import {
  getProfile,
  editProfile,
  changePassword,
} from "../../controllers/onboardingPartner/profileController.js";

const router = express.Router();

/* ---------- MULTER (MEMORY STORAGE FOR S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, JPG, and WEBP images are allowed"),
        false
      );
    }
    cb(null, true);
  },
});

/* ---------- ROUTES ---------- */
router.get("/", getProfile);
router.put("/edit", upload.single("image"), editProfile);
router.put("/changepassword", changePassword);

export default router;
