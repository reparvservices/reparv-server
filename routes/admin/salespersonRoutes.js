import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getAllActive,
  add,
  edit,
  getById,
  status,
  del,
  assignLogin,
  updatePaymentId,
  fetchFollowUpList,
  addFollowUp,
  getProjectPartnerList,
  assignProjectPartner,
} from "../../controllers/admin/salespersonController.js";

const router = express.Router();
/* ---------- MULTER CONFIG (S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(), //  IMPORTANT for S3
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.get("/active", getAllActive); // specific path first
router.get("/get/:id", getById); // more specific dynamic route
router.get("/:partnerlister", getAll);
router.get("/projectpartner/list/:id", getProjectPartnerList);
router.post(
  "/add",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
    { name: "reraImage", maxCount: 2 },
  ]),
  add
);
router.put(
  "/edit/:id",
  upload.fields([
    { name: "adharImage", maxCount: 2 },
    { name: "panImage", maxCount: 2 },
    { name: "reraImage", maxCount: 2 },
  ]),
  edit
);
router.put("/status/:id", status);
router.put("/update/paymentid/:id", updatePaymentId);
router.get("/followup/list/:id", fetchFollowUpList);
router.post("/followup/add/:id", addFollowUp);
router.put("/assignlogin/:id", assignLogin);
router.put("/assign/projectpartner/:id", assignProjectPartner);
router.delete("/delete/:id", del);

export default router;
