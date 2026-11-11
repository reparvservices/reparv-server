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
} from "../controllers/enquirerController.js";
import {
  requireEnquiryOwner,
  requireOwnPropertyInBody,
  requireOwnTeamMemberInBody,
} from "../../../core/middleware/requireEnquiryOwner.js";

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
const owner = requireEnquiryOwner("id");

router.get("/:id", owner, getById);
router.get("/remark/list/:id", owner, getRemarkList);
router.post("/properties", getProperties);
router.get("/property/list/:id", owner, getPropertyList);
router.put("/status/:id", owner, status);
router.put("/assign/:id", owner, requireOwnTeamMemberInBody("sales", "salespersonid"), assignEnquiry);
router.post("/visitscheduled/:id", owner, visitScheduled);
router.post("/followup/:id", owner, followUp);
router.post("/cancelled/:id", owner, cancelled);

// Token upload route uses memory upload; controller handles S3
router.post("/token/:id", owner, upload.single("paymentimage"), token);

router.put("/property/update/:id", owner, requireOwnPropertyInBody("propertyId"), updateEnquirerProperty);
router.put("/convert/to/digital-broker/:id", owner, toDigitalBroker);
router.delete("/delete/:id", owner, del);

export default router;