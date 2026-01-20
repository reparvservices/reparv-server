import express from "express";
import multer from "multer";
import path from "path";
import {
  getProfile,
  editProfile,
  changePassword,
} from "../../controllers/builder/profileController.js";

const router = express.Router();

/* ---------- MULTER CONFIG (S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(), //  IMPORTANT for S3
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.get("/", getProfile);
router.put("/edit",upload.single("image"), editProfile);
router.put("/changepassword", changePassword);
export default router;
