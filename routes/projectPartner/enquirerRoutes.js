import express from "express";
import multer from "multer";
import {
  getAll,
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
  toDigitalBroker,
} from "../../controllers/projectPartner/enquirerController.js";

const router = express.Router();

// Memory storage for S3 uploads
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

// Routes
router.get("/get/:source", getAll);
router.get("/:id", getById);
router.get("/remark/list/:id", getRemarkList);
router.post("/properties", getProperties);
router.get("/property/list/:id", getPropertyList);
router.put("/status/:id", status);
router.put("/assign/:id", assignEnquiry);
router.post("/visitscheduled/:id", visitScheduled);
router.post("/followup/:id", followUp);
router.post("/cancelled/:id", cancelled);

// Token upload route uses memory upload; controller handles S3
router.post("/token/:id", upload.single("paymentimage"), token);

router.put("/property/update/:id", updateEnquirerProperty);
router.put("/convert/to/digital-broker/:id", toDigitalBroker);
router.delete("/delete/:id", del);

export default router;