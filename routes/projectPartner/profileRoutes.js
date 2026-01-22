import express from "express";
import multer from "multer";
import {
  getProfile,
  editProfile,
  changePassword,
} from "../../controllers/projectPartner/profileController.js";
import {
  createSchedule,
  submitContactForm,
} from "../../controllers/projectPartner/ContactController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const storage = multer.memoryStorage(); // store file in memory for S3 upload

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

// ---------------- ROUTES ----------------
router.get("/", getProfile);

// For profile image upload, file will be in memory for S3
router.put("/edit", upload.single("image"), editProfile);

router.put("/changepassword", changePassword);

router.post("/contact", submitContactForm);

router.post("/schedule", createSchedule);

export default router;
