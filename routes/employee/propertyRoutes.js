import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getById,
  getImages,
  deleteImages,
  addProperty,
  update,
  status,
  approve,
  del,
  updateImages,
  editAdditionalInfo,
  additionalInfoAdd,
  propertyInfo,
  addRejectReason,
  fetchAdditionalInfo,
  seoDetails,
  setPropertyCommission,
  checkPropertyName,
  changePropertyLocation,
  getPropertyLocation,
  addCsvFileForFlat,
  addCsvFileForPlot,
  uploadBrochureAndVideoLink,
} from "../../controllers/employee/propertyController.js";

const router = express.Router();

/* ---------- MULTER MEMORY STORAGE FOR IMAGES ---------- */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, JPG, WEBP allowed"));
    }
    cb(null, true);
  },
});

/* ---------- MULTER STORAGE FOR BROCHURE UPLOAD ---------- */
const brochureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/brochures/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const brochureUpload = multer({
  storage: brochureStorage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedFileTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP images or PDF files are allowed."));
    }
    cb(null, true);
  },
});

/* ---------- MULTER MEMORY STORAGE FOR CSV ---------- */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/csv", "application/vnd.ms-excel"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only CSV files are allowed"));
    }
    cb(null, true);
  },
});
const uploadCsvMiddleware = (req, res, next) => {
  csvUpload.single("csv")(req, res, (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

/* ---------- GLOBAL MULTER ERROR HANDLER ---------- */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, error: "Each file must be under allowed size." });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res.status(400).json({ success: false, error: err.message || "Upload failed." });
  }
  next();
});

/* ---------- ROUTES ---------- */

// Specific routes first
router.get("/images/get/:id", getImages);
router.delete("/images/delete/:id", deleteImages);
router.get("/propertyinfo/:id", propertyInfo);
router.get("/location/get/:id", getPropertyLocation);
router.get("/additionalinfo/get/:id", fetchAdditionalInfo);

// Generic GET routes after specific
router.get("/", getAll);
router.get("/:id", getById);

// Property Name Check
router.post("/check-property-name", checkPropertyName);

// Add Property
router.post(
  "/add",
  imageUpload.fields([
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

// Edit Property
router.put(
  "/edit/:id",
  imageUpload.fields([
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
  update
);

// Update Images Only
router.put(
  "/images/edit/:id",
  imageUpload.fields([
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
  updateImages
);

// Status, SEO, Reject, Commission, Approve, Delete
router.put("/status/:id", status);
router.put("/seo/:id", seoDetails);
router.put("/reject/:id", addRejectReason);
router.put("/commission/:id", setPropertyCommission);
router.put("/approve/:id", approve);
router.delete("/delete/:id", del);

// Property Additional Info
router.post(
  "/additionalinfoadd",
  imageUpload.fields([
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
  imageUpload.fields([
    { name: "owneradhar", maxCount: 1 },
    { name: "ownerpan", maxCount: 1 },
    { name: "schedule", maxCount: 1 },
    { name: "signed", maxCount: 1 },
    { name: "satbara", maxCount: 1 },
    { name: "ebill", maxCount: 1 },
  ]),
  editAdditionalInfo
);

// Update Property Location
router.put("/location/edit/:id", changePropertyLocation);

// Brochure Upload
router.put("/brochure/upload/:id", brochureUpload.single("brochureFile"), uploadBrochureAndVideoLink);

// CSV Upload for Flat/Plot
router.post("/additionalinfo/flat/csv/add/:propertyid", uploadCsvMiddleware, addCsvFileForFlat);
router.post("/additionalinfo/plot/csv/add/:propertyid", uploadCsvMiddleware, addCsvFileForPlot);

export default router;
