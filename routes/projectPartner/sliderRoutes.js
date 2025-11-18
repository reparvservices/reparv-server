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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/svg+xml"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, SVG, and JPG images are allowed"));
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
