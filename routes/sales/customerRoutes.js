import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getById,
  addPayment,
  getPaymentList,
} from "../../controllers/sales/customerController.js";
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

router.get("/", getAll);
router.get("/:id", getById);
router.get("/payment/get/:id", getPaymentList);
router.post("/payment/add/:id", upload.single("paymentImage"), addPayment);
export default router;
