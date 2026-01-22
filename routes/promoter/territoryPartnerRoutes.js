import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  add,
  edit,
} from "../../controllers/promoter/territoryPartnerController.js";

const router = express.Router();
//---------------- MULTER MEMORY STORAGE ----------------
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


router.get("/:paymentStatus", getAll);

router.post(
  "/add",
  upload.fields([
    { name: "adharImage", maxCount: 1 },
    { name: "panImage", maxCount: 1 },
    { name: "reraImage", maxCount: 1 },
  ]),
  add
);

router.put(
  "/edit/:id",
  upload.fields([
    { name: "adharImage", maxCount: 1 },
    { name: "panImage", maxCount: 1 },
    { name: "reraImage", maxCount: 1 },
  ]),
  edit
);

export default router;
