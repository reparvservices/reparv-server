import express from "express";
import multer from "multer";
import path from "path";
import {
  getProfile,
  editProfile,
  changePassword,
} from "../../controllers/guestUser/profileController.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG allowed"));
    }
    cb(null, true);
  },
});



router.get("/", getProfile);
router.put("/edit",upload.single("image"), editProfile);
router.put("/changepassword", changePassword);
export default router;
