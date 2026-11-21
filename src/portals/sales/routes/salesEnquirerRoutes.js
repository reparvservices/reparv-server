import express from "express";
import multer from "multer";
import path from "path";
import { requireSalesEnquiryOwner } from "../../../core/middleware/requireEnquiryOwner.js";
import {
  getAll,
  getById,
  status,
  visitScheduled,
  cancelled,
  followUp,
  token,
  getTerritoryPartners,
  assignEnquiry,
  getPropertyCity,
  getByStatus,
  getAvailableTPsForDate,
  getProperties,
  getRemarkList,
  getPropertyList,
} from "../controllers/enquirerController.js";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const storage = multer.memoryStorage(); // store file in memory for S3 upload

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.get("/get/:source", getAll);
router.get("/remark/list/:id", getRemarkList);
router.get("/property/list/:id", getPropertyList);
router.get("/:id", getById);
router.get("/property/city/:id", getPropertyCity);
router.post("/properties", getProperties);
router.get("/territorypartner/available/get/:city", getTerritoryPartners);
// Every action on an enquiry requires it to be assigned to the signed-in sales partner
const owner = requireSalesEnquiryOwner("id");
router.post("/assign/to/partner/:id", owner, assignEnquiry);
router.put("/status/:id", owner, status);
router.post("/visitscheduled/:id", owner, visitScheduled);
router.post("/followup/:id", owner, followUp);
router.post("/cancelled/:id", owner, cancelled);
router.post("/token/:id", owner, upload.single("paymentimage"), token);
//filter
router.get("/enquirybystatus/:id", getByStatus);
router.get("/territorypartner/get-available-tps/:city", getAvailableTPsForDate);

export default router;
