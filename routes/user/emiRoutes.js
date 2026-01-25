import express from "express";
import { submitEmiForm } from "../../controllers/user/emiController.js";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = express.Router();

/* =========================
   Multer Configuration
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/emi-documents";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
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
