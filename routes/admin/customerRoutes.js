import express from "express";
import multer from "multer";
import {
  getAll,
  getById,
  addPayment,
  getPaymentList,
} from "../../controllers/admin/customerController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, and JPG images are allowed"),
        false
      );
    }
    cb(null, true);
  },
});

// ---------------- MULTER ERROR HANDLER ----------------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Image must be under 2MB.",
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "Upload failed.",
    });
  }
  next();
});

// ---------------- ROUTES (UNCHANGED) ----------------
router.get("/", getAll);
router.get("/:id", getById);
router.get("/payment/get/:id", getPaymentList);
router.post(
  "/payment/add/:id",
  upload.single("paymentImage"),
  addPayment
);

export default router;