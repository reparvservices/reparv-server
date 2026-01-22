import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  addImages,
  status,
  del,
  addSmallScreenImage,
} from "../../controllers/projectPartner/sliderController.js";

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
router.post("/addimages",upload.array("images[]"), addImages);
router.put("/small/addimage/:id", upload.single("image"), addSmallScreenImage);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
