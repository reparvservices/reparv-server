import express from "express";
import multer from "multer";
import path from "path";

import {
  getAll,
  getAllPlans,
  getById,
  addSubscription,
  updateSubscription,
  status,
  del,
  highlight,
  
} from "../../controllers/admin/subscriptionPricingController.js";

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

router.get("/", getAll);
router.get("/plans/:partnerType", getAllPlans);
router.get("/:id", getById);
// Add Subscription with image upload
router.post(
  "/add",
  upload.fields([
    { name: "firstImage", maxCount: 1 },
    { name: "secondImage", maxCount: 1 },
    { name: "thirdImage", maxCount: 1 },
  ]),
  addSubscription
);

// Edit Subscription with image upload
router.put(
  "/edit/:id",
  upload.fields([
    { name: "firstImage", maxCount: 1 },
    { name: "secondImage", maxCount: 1 },
    { name: "thirdImage", maxCount: 1 },
  ]),
  updateSubscription
);
router.put("/status/:id", status);
router.put("/highlight/:id", highlight);
router.delete("/delete/:id", del);

export default router;
