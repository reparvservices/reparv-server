import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getAllActive,
  add,
  edit,
} from "../../controllers/projectPartner/territoryPartnerController.js";

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

router.get("/active", getAllActive);
router.get("/", getAll);

router.post(
  "/add",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
    { name: "reraImage", maxCount: 2 },
  ]),
  add,
);
router.put(
  "/edit/:id",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
    { name: "reraImage", maxCount: 2 },
  ]),
  edit,
);

export default router;
