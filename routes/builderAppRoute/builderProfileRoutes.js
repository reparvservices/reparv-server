import express from "express";
import multer from "multer";
import path from "path";
import {
  changePassword,
  editProfile,
  getProfile,
  resetPassword,
  sendOtp,
  verifyOtp,
} from "../../controllers/builderApp/profileController.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, //  Limit file size (5MB)
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.get("/", getProfile);
router.put("/edit", upload.single("image"), editProfile);
router.put("/changepassword", changePassword);
router.get("/send-otp/:id", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
