import express from "express";
import multer from "multer";
import {
  addProperty,
  addPropertyNew,
  getAll,
  update,
} from "../../controllers/projectPartnerApp/propertyController.js";
import { generateUploadUrl } from "../../controllers/projectPartnerApp/uploadController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // images
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",

      // videos
      "video/mp4",
      "video/quicktime",
      "video/x-matroska",
      "video/webm",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only images and videos are allowed"));
    }

    cb(null, true);
  },
});

/* ---------- ROUTES ---------- */
router.get("/getAll/:id", getAll);
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
    { name: "propertyVideo", maxCount: 1 },
  ]),
  addProperty,
);

//new property add route
// Add property (with images + lat/lng in body)
router.post(
  "/add",
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
    { name: "extraImages", maxCount: 10 }, // ← NEW
  ]),
  addPropertyNew,
);
router.put(
  "/edit/:id",
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
    { name: "propertyVideo", maxCount: 1 },
  ]),
  update,
);

router.post("/generate-upload-url", generateUploadUrl);

/* ---------- MULTER ERROR HANDLER ---------- */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ success: false, error: "Each image must be under 50MB" });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

export default router;
