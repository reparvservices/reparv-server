import express from "express";
import { add, getProfile, googleLogin, update } from "../../controllers/customerAppController/userController.js";
import multer from "multer";
import path from 'path';

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

router.post("/signup", add);
//router.post("/login",login)

router.put("/update",upload.single('userimage'),update);
router.get("/profile",getProfile)
router.post('/google-login', googleLogin);

export default router;

