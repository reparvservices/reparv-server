import express from "express";
import {
  addInWishList,
  addProperty,
  del,
  getAll,
  getUserWishlist,
  status,
  updateProperty,
} from "../../controllers/customerAppController/propertyController.js";

import multer from "multer";
import path from "path";

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
  limits: {
    fileSize: 1024 * 1024 * 2,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ success: false, error: "Each image must be under 2MB." });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res
      .status(400)
      .json({ success: false, error: err.message || "Upload failed." });
  }
  next();
});

router.post("/add-wishlist", addInWishList);
router.get("/get-wishlist/:user_id", getUserWishlist);
router.post(
  "/post",
  upload.fields([
    { name: "frontView", maxCount: 3 },
    { name: "nearestLandmark", maxCount: 3 },
    { name: "developedAmenities", maxCount: 3 },
    { name: "sideView", maxCount: 3 },
    { name: "hallView", maxCount: 3 },
    { name: "kitchenView", maxCount: 3 },
    { name: "bedroomView", maxCount: 3 },
    { name: "bathroomView", maxCount: 3 },
    { name: "balconyView", maxCount: 3 },
  ]),
  addProperty
);
router.get('/myproperty/:id',getAll)
router.put(
  "/update/:propertyid",
  upload.fields([
    { name: "frontView" },
    { name: "sideView" },
    { name: "kitchenView" },
    { name: "hallView" },
    { name: "bedroomView" },
    { name: "bathroomView" },
    { name: "balconyView" },
    { name: "nearestLandmark" },
    { name: "developedAmenities" },
  ]),
  updateProperty
);

router.delete("/delete/:id", del);
router.put("/status/:id", status);
export default router;
