import express from "express";
import multer from "multer";
import {
  getAll,
  getAllActive,
  getById,
  add,
  edit,
  status,
  del,
  seoDetails,
} from "../controllers/blogController.js";

const router = express.Router();

/* Multer – memory storage for S3 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG, and WEBP allowed"));
    }
    cb(null, true);
  },
});

/* Routes */
router.get("/", getAll);
router.get("/active", getAllActive);
router.get("/:id", getById);

router.post(
  "/add",
  upload.fields([{ name: "blogImage", maxCount: 1 }]),
  add
);

router.put(
  "/edit/:id",
  upload.fields([{ name: "blogImage", maxCount: 1 }]),
  edit
);

router.put("/status/:id", status);
router.put("/seo/:id", seoDetails);
router.delete("/delete/:id", del);

export default router;
