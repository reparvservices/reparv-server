import express from "express";
import multer from "multer";
import {
  addProperty,
  addInWishList,
  getUserWishlist,
  getAll,
  updateProperty,
  del,
  status,
} from "../../controllers/customerAppController/propertyController.js";

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

/* ---------- ROUTES ---------- */
router.post("/add-wishlist", addInWishList);
router.get("/get-wishlist/:user_id", getUserWishlist);

router.post(
  "/post",
  upload.fields([
    { name: "frontView", maxCount: 3 },
    { name: "sideView", maxCount: 3 },
    { name: "kitchenView", maxCount: 3 },
    { name: "hallView", maxCount: 3 },
    { name: "bedroomView", maxCount: 3 },
    { name: "bathroomView", maxCount: 3 },
    { name: "balconyView", maxCount: 3 },
    { name: "nearestLandmark", maxCount: 3 },
    { name: "developedAmenities", maxCount: 3 },
  ]),
  addProperty,
);

router.get("/myproperty/:id", getAll);

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
  updateProperty,
);

router.delete("/delete/:id", del);
router.put("/status/:id", status);

/* ---------- MULTER ERROR HANDLER ---------- */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ success: false, error: "Each image must be under 2MB" });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

export default router;
