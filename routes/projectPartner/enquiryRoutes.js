import express from "express";
import multer from "multer";
import { addCSVEnquiry, addEnquiry, updateEnquiry } from "../../controllers/projectPartner/enquiryController.js";

const router = express.Router();

// Memory storage for S3
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/csv", "application/vnd.ms-excel"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only CSV files are allowed"));
    }
    cb(null, true);
  },
});

router.post("/add/enquiry", addEnquiry);

// CSV upload uses memoryStorage; controller will handle S3
router.post("/csv/add/", upload.single("csv"), addCSVEnquiry);

router.put("/update/enquiry/:id", updateEnquiry);

export default router;