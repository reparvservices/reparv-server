import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getById,
  addPayment,
  getPaymentList,
} from "../../controllers/employee/customerController.js";
const router = express.Router();

/* ---------- MULTER (MEMORY) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 2, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, JPG, WEBP allowed"));
    }
    cb(null, true);
  },
});

router.get("/", getAll);
router.get("/:id", getById);
router.get("/payment/get/:id", getPaymentList);
router.post("/payment/add/:id", upload.single("paymentImage"), addPayment);
export default router;
