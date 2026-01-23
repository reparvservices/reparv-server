import express from "express";
import multer from "multer";
import {
  getAll,
  getAllActive,
  add,
  edit,
} from "../../controllers/projectPartner/salespersonController.js";

const router = express.Router();

// Memory storage for S3 upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

// Routes
router.get("/active", getAllActive); // specific path first
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
