import express from "express";
import {
  add,
  sendProjectPartnerOtp,
  verifyProjectPartnerOtp,
} from "../controllers/authController.js";
import multer from "multer";
import db from "#db";
import { updateOneSignalId } from "../controllers/userController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // images
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only images and videos are allowed"));
    }

    cb(null, true);
  },
});

const router = express.Router();
router.post(
  "/register",
  upload.fields([{ name: "businessLogo", maxCount: 1 }]),
  add,
);
router.post("/send-otp", sendProjectPartnerOtp);
router.post("/verify-otp", verifyProjectPartnerOtp);
router.put("/update-onesignal/:id", updateOneSignalId);
// routes/auth.js (or wherever your partner routes are)
router.get("/check-mobile", (req, res) => {
  const { mobile } = req.query;
  console.log("Checking mobile:", mobile);
  if (!mobile) {
    return res.status(400).json({ exists: false, message: "Mobile required" });
  }

  db.query(
    "SELECT id FROM projectpartner WHERE contact = ? LIMIT 1",
    [mobile],
    (err, rows) => {
      if (err) {
        console.error("check-mobile error:", err);
        return res.status(500).json({ exists: false, message: "Server error" });
      }

      return res.json({ exists: rows.length > 0 });
    },
  );
});

router.get("/check-username", (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res
      .status(400)
      .json({ exists: false, message: "Username required" });
  }

  db.query(
    "SELECT id FROM projectpartner WHERE username = ? LIMIT 1",
    [username],
    (err, rows) => {
      if (err) {
        console.error("check-username error:", err);
        return res.status(500).json({ exists: false, message: "Server error" });
      }

      return res.json({ exists: rows.length > 0 });
    },
  );
});

router.get("/check-email", (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ exists: false, message: "Email required" });
  }

  db.query(
    "SELECT id FROM projectpartner WHERE email = ? LIMIT 1",
    [email],
    (err, rows) => {
      if (err) {
        console.error("check-email error:", err);
        return res.status(500).json({ exists: false, message: "Server error" });
      }

      return res.json({ exists: rows.length > 0 });
    },
  );
});
export default router;
