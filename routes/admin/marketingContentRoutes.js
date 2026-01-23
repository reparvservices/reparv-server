import express from "express";
import multer from "multer";
import path from "path";

import {
  getAll,
  getById,
  add,
  update,
  del,
} from "../../controllers/admin/marketingContentController.js";

const router = express.Router();
/* ---------- MULTER CONFIG (S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(), // IMPORTANT for S3
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

// Routes
router.get("/", getAll);
router.get("/:id", getById);
router.post("/add", upload.single("contentFile"), add);
router.put("/edit/:id", upload.single("contentFile"), update);
router.delete("/delete/:id", del);

export default router;
