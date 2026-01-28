import express from "express";
import multer from "multer";
import {
  getAll,
  getAllDigitalBroker,
  getById,
  del,
  status,
  assignEnquiry,
  visitScheduled,
  cancelled,
  followUp,
  token,
  getRemarkList,
  getProperties,
  getPropertyList,
  updateEnquirerProperty,
} from "../../controllers/admin/enquirerController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, and JPG images are allowed"),
        false
      );
    }
    cb(null, true);
  },
});

// ---------------- MULTER ERROR HANDLER ----------------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "Image must be under 2MB.",
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

// ---------------- ROUTES (UNCHANGED) ----------------
router.get("/get/:source", getAll);

// get digital broker enquiries
router.get("/digital-broker/get/:broker", getAllDigitalBroker);

router.get("/:id", getById);
router.get("/remark/list/:id", getRemarkList);
router.post("/properties", getProperties);
router.get("/property/list/:id", getPropertyList);

router.put("/status/:id", status);
router.put("/assign/:id", assignEnquiry);
router.post("/visitscheduled/:id", visitScheduled);
router.post("/followup/:id", followUp);
router.post("/cancelled/:id", cancelled);

// payment image upload (route unchanged)
router.post(
  "/token/:id",
  upload.single("paymentimage"),
  token
);

router.put("/property/update/:id", updateEnquirerProperty);
router.delete("/delete/:id", del);

export default router;