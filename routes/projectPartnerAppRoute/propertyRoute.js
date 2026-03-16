import express from "express";
import multer from "multer";
import {
  addProperty,
  addPropertyNew,
  getAll,
  update,
  updateProperty,
} from "../../controllers/projectPartnerApp/propertyController.js";
import { generateUploadUrl } from "../../controllers/projectPartnerApp/uploadController.js";

const router = express.Router();

const MAX_IMAGE_SIZE_MB = 50;
const MAX_VIDEO_SIZE_MB = 200;

/* ---------- MULTER CONFIG ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024, // 200MB ceiling (covers both images & video)
    files: 40, // max total files in one request
  },
  fileFilter: (req, file, cb) => {
    const imageTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    const videoTypes = [
      "video/mp4",
      "video/quicktime",
      "video/x-matroska",
      "video/webm",
    ];
    const allAllowed = [...imageTypes, ...videoTypes];

    if (!allAllowed.includes(file.mimetype)) {
      return cb(
        new Error(
          `"${file.originalname}" has an unsupported format (${file.mimetype}). ` +
            `Allowed formats: JPG, PNG, WEBP for images — MP4, MOV, MKV, WEBM for videos.`,
        ),
      );
    }

    // Per-image size guard (multer limits apply per file but only after full read;
    // this gives a faster, friendlier message for images)
    const isImage = imageTypes.includes(file.mimetype);
    if (isImage) {
      // We can't read size here yet, but we tag it for the post-upload check
      file._isImage = true;
    }

    cb(null, true);
  },
});

/* ---------- ROUTES ---------- */
router.get("/getAll/:id", getAll);

// Legacy add route
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
router.put("/update/:propertyid", updateProperty);
// New add route — supports extraImages + lat/lng in body
router.post("/add", addPropertyNew);

// Edit route
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
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          success: false,
          error:
            `File too large. Maximum allowed size is ${MAX_VIDEO_SIZE_MB}MB per file. ` +
            `Please compress your images/videos and try again.`,
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          error: `Too many files uploaded at once. Maximum is 40 files per request.`,
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          error: `Unexpected file field "${err.field}". Please upload files using the correct field names.`,
        });
      default:
        return res.status(400).json({
          success: false,
          error: `File upload error: ${err.message}`,
        });
    }
  }

  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message, // already descriptive from fileFilter above
    });
  }

  next();
});

export default router;
