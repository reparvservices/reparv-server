import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getAllActive,
  getById,
  add,
  edit,
  status,
  del,
  seoDetails
} from "../../controllers/admin/trendController.js";

const router = express.Router();


/* ---------- MULTER CONFIG (S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(), //  IMPORTANT for S3
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
router.get("/active", getAllActive);
router.get("/:id", getById);
router.post(
  "/add",
  upload.fields([
    { name: "trendImage", maxCount: 1 },
  ]),
  add
);
router.put(
  "/edit/:id",
  upload.fields([
    { name: "trendImage", maxCount: 1 },
  ]),
  edit
);

router.put("/status/:id", status);
router.put("/seo/:id", seoDetails);
router.delete("/delete/:id", del);

export default router;