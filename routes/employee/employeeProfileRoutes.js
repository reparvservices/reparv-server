import express from "express";
import multer from "multer";
import path from "path";
import {
  getProfile,
  editProfile,
  changePassword,
} from "../../controllers/employee/profileController.js";

const router = express.Router();

/* ---------- MULTER (MEMORY) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 2, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, JPG, WEBP allowed"));
    }
    cb(null, true);
  },
});



router.get("/", getProfile);
router.put("/edit",upload.single("image"), editProfile);
router.put("/changepassword", changePassword);
export default router;
