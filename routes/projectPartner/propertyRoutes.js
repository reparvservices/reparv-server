import express from "express";
import multer from "multer";
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
} from "../../controllers/projectPartner/propertyController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

// ---------------- Multer error handler ----------------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Each image must be under 2MB.",
      });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res
      .status(400)
      .json({ success: false, error: err.message || "Upload failed." });
  }
  next();
});

// ---------------- ROUTES ----------------
router.get("/", getAll);
router.get("/:id", getById);
router.get("/images/get/:id", getImages);
router.delete("/images/delete/:id", deleteImages);
router.post("/check-property-name", checkPropertyName);

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
  ]),
  addProperty,
);

router.put(
  "/edit/:id",
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
  update,
);

router.put(
  "/images/edit/:id",
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
  updateImages,
);

router.put("/status/:id", status);
router.put("/seo/:id", seoDetails);
router.put("/reject/:id", addRejectReason);
router.put("/commission/:id", setPropertyCommission);
router.put("/approve/:id", approve);
router.delete("/delete/:id", del);
router.get("/propertyinfo/:id", propertyInfo);

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
  additionalInfoAdd,
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
  editAdditionalInfo,
);

// Property Location
router.get("/location/get/:id", getPropertyLocation);
router.put("/location/edit/:id", changePropertyLocation);

// ---------------- BROCHURE UPLOAD ----------------
const brochureUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedFileTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG, WEBP images or PDF files are allowed."),
      );
    }
    cb(null, true);
  },
});

router.put(
  "/brochure/upload/:id",
  brochureUpload.single("brochureFile"),
  uploadBrochureAndVideoLink,
);

// ---------------- CSV UPLOAD ----------------
const csvUpload = multer({
  storage: memoryStorage,
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
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.get("/additionalinfo/get/:id", fetchAdditionalInfo);
router.post(
  "/additionalinfo/flat/csv/add/:propertyid",
  uploadCsvMiddleware,
  addCsvFileForFlat,
);
router.post(
  "/additionalinfo/plot/csv/add/:propertyid",
  uploadCsvMiddleware,
  addCsvFileForPlot,
);

export default router;
