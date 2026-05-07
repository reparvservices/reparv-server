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
  getPropertyLikeCount,
  getById,
  removeFromWishlist,
} from "../controllers/propertyController.js";

const router = express.Router();

/* ---------- MULTER (MEMORY) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, //0MB per image
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
router.post("/post", addProperty);
router.get("/myproperty/:id", getAll);
router.put("/update/:propertyid", updateProperty);
router.get("/:id", getById);
router.delete("/delete/:id", del);
router.put("/status/:id", status);
router.get("/likes/:id", getPropertyLikeCount);
// DELETE /customerapp/property/remove-wishlist/:userId/:propertyId
router.delete("/remove-wishlist/:userId/:propertyId", removeFromWishlist);

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
