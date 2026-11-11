import express from "express";
import multer from "multer";
import {
  getAll,
  getById,
  getCategories,
  add,
  edit,
  status,
  del,
} from "../controllers/advertisementController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(), // buffer goes straight to S3
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
    }
    cb(null, true);
  },
});

// Turns multer errors (size/type) into a readable 400 instead of a 500.
const uploadImage = (req, res, next) =>
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Image must be 2MB or smaller." : err.message;
    res.status(400).json({ message });
  });

router.get("/", getAll);
router.get("/categories", getCategories);
router.get("/:id", getById);
router.post("/add", uploadImage, add);
router.put("/edit/:id", uploadImage, edit);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
