import express from "express";
import multer from "multer";
import {
  getAll,
  getAllActive,
  add,
  edit,
  getById,
  status,
  del,
  assignLogin,
} from "../../controllers/admin/guestUserController.js";

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

/* ---------- ROUTES ---------- */
router.get("/", getAll);
router.get("/active", getAllActive);
router.get("/:id", getById);

router.post(
  "/add",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
  ]),
  add,
);

router.put(
  "/edit/:id",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
  ]),
  edit,
);

router.put("/status/:id", status);
router.put("/assignlogin/:id", assignLogin);
router.delete("/delete/:id", del);

export default router;
