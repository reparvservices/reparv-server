import express from "express";
import {
  add,
  sendProjectPartnerOtp,
  verifyProjectPartnerOtp,
} from "../../controllers/projectPartnerApp/authController.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // images
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only images and videos are allowed"));
    }

    cb(null, true);
  },
});

const router = express.Router();
router.post(
  "/register",
  upload.fields([{ name: "businessLogo", maxCount: 1 }]),
  add,
);
router.post("/send-otp", sendProjectPartnerOtp);
router.post("/verify-otp", verifyProjectPartnerOtp);

export default router;
