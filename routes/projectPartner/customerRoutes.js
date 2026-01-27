import express from "express";
import multer from "multer";
import {
  getAll,
  getById,
  addPayment,
  getPaymentList,
} from "../../controllers/projectPartner/customerController.js";

const router = express.Router();

// Use memory storage for multer (so we can directly upload to S3)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
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

// Use memory upload; controller will handle S3
router.post("/payment/add/:id", upload.single("paymentImage"), addPayment);

export default router;