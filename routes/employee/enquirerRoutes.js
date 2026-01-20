import express from "express";
import multer from "multer";
import path from "path";
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
} from "../../controllers/employee/enquirerController.js";

const router = express.Router();

/* ---------- MULTER (MEMORY) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 2, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, JPG, WEBP allowed"));
    }
    cb(null, true);
  },
});


//router.get("/", getAll);
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
router.post("/token/:id",upload.single("paymentimage"), token);
router.put("/property/update/:id", updateEnquirerProperty);
router.put("/convert/to/digital-broker/:id", toDigitalBroker);
router.delete("/delete/:id", del);

export default router;
