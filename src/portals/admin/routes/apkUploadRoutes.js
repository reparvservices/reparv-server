import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  getAll,
  getById,
  add,
  update,
  status,
  del,
} from "../controllers/apkUploadController.js";

const router = express.Router();

// Ensure directory exists
const apkDir = "./uploads/apps";
if (!fs.existsSync(apkDir)) {
  fs.mkdirSync(apkDir, { recursive: true });
}

// Multer config for APK files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, apkDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // Max 200MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/vnd.android.package-archive") {
      cb(null, true);
    } else {
      cb(new Error("Only APK files are allowed"));
    }
  },
});

// Routes
router.get("/", getAll);
router.get("/:id", getById);
router.post("/add", upload.single("apkFile"), add);
router.put("/edit/:id", upload.single("apkFile"), update);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;