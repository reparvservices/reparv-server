import express from "express";
import multer from "multer";
import path from "path";
import {
  getProfile,
  editProfile,
  changePassword,
  updateOneSignalId,
  updateProjectPartner,
  changeProjectPartnerRequestSend,
  v2EditProfile,
} from "../../controllers/territoryPartner/profileController.js";

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

router.get("/", getProfile);
router.put("/edit", upload.single("image"), editProfile);
router.put(
  "/v2/edit",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  v2EditProfile,
);
router.put("/changepassword", changePassword);
router.put("/update-onesignal", updateOneSignalId);
router.put("/update-projectpartner", updateProjectPartner);
router.put("/project-partner/change/request", changeProjectPartnerRequestSend);
export default router;
