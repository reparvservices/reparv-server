import express from "express";
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
  deleteBrochureFile,
  hotDeal,
  changeProjectPartner,
} from "../../controllers/admin/propertyController.js";
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

router.get("/get/:lister", getAll);
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
  addProperty
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
  update
);
// Update Images
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
  updateImages
);

router.put("/status/:id", status);
router.put("/set/hotdeal/:id", hotDeal);
router.put("/seo/:id", seoDetails);
router.put("/assign/to/project-partner/:id", changeProjectPartner);
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

// property location update
router.get("/location/get/:id", getPropertyLocation);
router.put("/location/edit/:id", changePropertyLocation);

// === Multer Setting for Upload Brochure ===
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
        new Error("Only JPG, PNG, WEBP images or PDF files are allowed.")
      );
    }

    cb(null, true);
  },
});

// === Route for Brochure Upload (and Video Link in Body) ===
router.put(
  "/brochure/upload/:id",
  brochureUpload.single("brochureFile"),
  uploadBrochureAndVideoLink
);

router.delete(
  "/brochure/delete/:id",
  deleteBrochureFile
);

// multer for Upload Property Additional Information
const uploadForCsv = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/csv", "application/vnd.ms-excel"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only CSV files are allowed"));
    }
    cb(null, true);
  },
});

const uploadCsvMiddleware = (req, res, next) => {
  uploadForCsv.single("csv")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific error (e.g. file too large)
      return res.status(400).json({ message: err.message });
    } else if (err) {
      // Other errors
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

// Fetch & Upload CSV File
router.get("/additionalinfo/get/:id", fetchAdditionalInfo);
router.post(
  "/additionalinfo/flat/csv/add/:propertyid",
  uploadCsvMiddleware,
  addCsvFileForFlat
);
router.post(
  "/additionalinfo/plot/csv/add/:propertyid",
  uploadCsvMiddleware,
  addCsvFileForPlot
);

export default router;
