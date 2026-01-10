import express from "express";
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
      return res.status(400).json({ success: false, error: "Each image must be under 2MB." });
    }
    return res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    return res.status(400).json({ success: false, error: err.message || "Upload failed." });
  }
  next();
});

router.get("/", getAll);
router.get("/:id", getById);
router.get("/images/:id", getImages);
router.delete("/images/delete/:id", deleteImages);
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
    { name: "balconyView", maxCount: 3},
  ]),
  update
);
router.post("/addimages",upload.array("images[]"), addImages);
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

export default router;
