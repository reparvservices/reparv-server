import express from "express";
import multer from "multer";
import {
  getAll,
  getById,
  getImages,
  addProperty,
  update,
  deleteImages,
  addImages,
  additionalInfoAdd,
  editAdditionalInfo,
  propertyInfo,
} from "../../controllers/user/propertyController.js";

const router = express.Router();

/* ---------- MULTER MEMORY STORAGE FOR S3 ---------- */
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

/* ---------- PROPERTY ROUTES ---------- */
router.get("/", getAll);
router.get("/:id", getById);
router.get("/images/:id", getImages);
router.delete("/images/delete/:id", deleteImages);
router.get("/propertyinfo/:id", propertyInfo);

/* ---------- ADD / EDIT PROPERTY ---------- */
router.post(
  "/add",
  upload.fields([
    { name: "frontView", maxCount: 3 },
    { name: "sideView", maxCount: 3 },
    { name: "hallView", maxCount: 3 },
    { name: "kitchenView", maxCount: 3 },
    { name: "bedroomView", maxCount: 3 },
    { name: "bathroomView", maxCount: 3 },
    { name: "balconyView", maxCount: 3 },
    { name: "nearestLandmark", maxCount: 3 },
    { name: "developedAmenities", maxCount: 3 },
  ]),
  addProperty
);

router.put(
  "/edit/:id",
  upload.fields([
    { name: "frontView", maxCount: 3 },
    { name: "sideView", maxCount: 3 },
    { name: "hallView", maxCount: 3 },
    { name: "kitchenView", maxCount: 3 },
    { name: "bedroomView", maxCount: 3 },
    { name: "bathroomView", maxCount: 3 },
    { name: "balconyView", maxCount: 3 },
    { name: "nearestLandmark", maxCount: 3 },
    { name: "developedAmenities", maxCount: 3 },
  ]),
  update
);

/* ---------- ADDITIONAL IMAGES ---------- */
router.post("/addimages", upload.array("images", 10), addImages); // up to 10 images at once

/* ---------- ADDITIONAL INFO ---------- */
router.post(
  "/additionalinfoadd",
  upload.fields([
    { name: "owneradhar", maxCount: 1 },
    { name: "ownerpan", maxCount: 1 },
    { name: "schedule", maxCount: 1 },
    { name: "signed", maxCount: 1 },
    { name: "satbara", maxCount: 1 },
    { name: "ebill", maxCount: 1 },
  ]),
  additionalInfoAdd
);

router.put(
  "/editadditionalinfo/:id",
  upload.fields([
    { name: "owneradhar", maxCount: 1 },
    { name: "ownerpan", maxCount: 1 },
    { name: "schedule", maxCount: 1 },
    { name: "signed", maxCount: 1 },
    { name: "satbara", maxCount: 1 },
    { name: "ebill", maxCount: 1 },
  ]),
  editAdditionalInfo
);

/* ---------- GLOBAL ERROR HANDLER FOR MULTER ---------- */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Each image must be under 5MB.",
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message || "Upload failed.",
    });
  }
  next();
});

export default router;
