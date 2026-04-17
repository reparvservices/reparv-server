import express from "express";
import {
  getLoansByUserId,
  getUserLoanCounts,
  submitEmiForm,
} from "../controllers/loanEmiController.js";
import multer from "multer";

const router = express.Router();

const storage = multer.memoryStorage();
const uploadLoanDocs = multer({ storage: multer.memoryStorage() }).fields([
  { name: "panImage", maxCount: 1 },
  { name: "aadhaarFrontImage", maxCount: 1 },
  { name: "aadhaarBackImage", maxCount: 1 },
]);

router.post(
  "/emiform",
  uploadLoanDocs, // 🔥 REQUIRED
  submitEmiForm,
);

router.get("/counts/:user_id", getUserLoanCounts);
router.get("/loan-applications/:user_id", getLoansByUserId);

export default router;
