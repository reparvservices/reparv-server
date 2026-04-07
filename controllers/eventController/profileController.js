import db from "../../config/dbconnect.js";
import crypto from "crypto";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";

// ── Helper: send OTP via MSG91 or console fallback ───────────────────────────
const sendOtp = async (mobile, otp) => {
  // Replace with your MSG91 call if needed
  console.log(`[OTP] Send ${otp} to ${mobile}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /profile/:id  →  get user profile
// ─────────────────────────────────────────────────────────────────────────────
export const getUserProfile = (req, res) => {
  const userId = req.params.id;
  const query =
    "SELECT id, fullName, mobileNumber, role, companyName, email, profileImage, created_at, updated_at FROM eventUsers WHERE id = ?";

  db.query(query, [userId], (err, result) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    if (result.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, user: result[0] });
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /profile/:id  →  edit profile (fullName, role, companyName, profileImage)
// does NOT allow mobileNumber or email change here
// ─────────────────────────────────────────────────────────────────────────────
export const editProfile = (req, res) => {
  const userId = req.params.id;
  const { fullName, role, companyName, profileImage, email } = req.body;
  console.log("editProfile called with:", req.body);
  if (!fullName || !fullName.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "fullName is required" });
  }

  const query = `
    UPDATE eventUsers
    SET fullName = ?, role = ?, email = ?, companyName = ?, profileImage = ?, updated_at = NOW()
    WHERE id = ?
  `;

  db.query(
    query,
    [
      fullName.trim(),
      role?.trim() || null,
      email,
      companyName?.trim() || null,
      profileImage?.trim() || null,
      userId,
    ],
    (err, result) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      if (result.affectedRows === 0)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      return res
        .status(200)
        .json({ success: true, message: "Profile updated successfully" });
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /profile/:id/request-mobile-otp
// Step 1 — user wants to change mobile: send OTP to NEW number
// Body: { newMobile }
// ─────────────────────────────────────────────────────────────────────────────
export const requestMobileChangeOtp = async (req, res) => {
  console.log("===== requestMobileChangeOtp API Called =====");
  console.log("Params:", req.params);
  console.log("Body:", req.body);

  const userId = req.params.id;
  const { newMobile } = req.body;

  console.log("User ID:", userId);
  console.log("New Mobile:", newMobile);

  // Validate mobile
  if (!newMobile || !/^\d{10}$/.test(newMobile)) {
    console.log("❌ Invalid mobile number format");
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number required",
    });
  }

  console.log("✅ Mobile format valid. Checking if already exists...");

  // Check if number already taken
  db.query(
    "SELECT id FROM eventUsers WHERE mobileNumber = ? AND id != ?",
    [newMobile, userId],
    async (err, rows) => {
      if (err) {
        console.error("❌ Database error during mobile check:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      }

      console.log("Mobile check result:", rows);

      if (rows.length > 0) {
        console.log("❌ Mobile number already in use");
        return res
          .status(409)
          .json({ success: false, message: "Mobile number already in use" });
      }

      console.log("✅ Mobile not in use. Generating OTP...");

      // Generate OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 10 * 60 * 1000);

      console.log("Generated OTP:", otp);
      console.log("OTP Expiry:", expiry);

      // Store OTP
      db.query(
        "UPDATE eventUsers SET otp = ?, otp_expiry = ?, updated_at = NOW() WHERE id = ?",
        [otp, expiry, userId],
        async (err2, result) => {
          if (err2) {
            console.error("❌ Database error during OTP update:", err2);
            return res
              .status(500)
              .json({ success: false, message: "Database error" });
          }

          console.log("OTP stored successfully. DB Result:", result);

          try {
            console.log("📩 Sending OTP SMS...");
            await sendOtpSMS(newMobile, otp);
            console.log("✅ OTP SMS sent successfully");
          } catch (smsError) {
            console.error("❌ SMS sending failed:", smsError);
            return res
              .status(500)
              .json({ success: false, message: "Failed to send OTP" });
          }

          console.log("===== requestMobileChangeOtp SUCCESS =====");

          return res.status(200).json({
            success: true,
            message: `OTP sent to ${newMobile}`,
            ...(process.env.NODE_ENV !== "production" && { otp }),
          });
        },
      );
    },
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /profile/:id/verify-mobile-otp
// Step 2 — verify OTP and update mobileNumber
// Body: { newMobile, otp }
// ─────────────────────────────────────────────────────────────────────────────
export const verifyMobileChangeOtp = (req, res) => {
  const userId = req.params.id;
  const { newMobile, otp } = req.body;

  if (!newMobile || !otp) {
    return res
      .status(400)
      .json({ success: false, message: "newMobile and otp are required" });
  }

  db.query(
    "SELECT otp, otp_expiry FROM eventUsers WHERE id = ?",
    [userId],
    (err, rows) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      if (rows.length === 0)
        return res
          .status(404)
          .json({ success: false, message: "User not found" });

      const { otp: storedOtp, otp_expiry } = rows[0];

      if (!storedOtp) {
        return res.status(400).json({
          success: false,
          message: "No OTP requested. Please request OTP first.",
        });
      }

      if (new Date() > new Date(otp_expiry)) {
        return res.status(400).json({
          success: false,
          message: "OTP has expired. Please request again.",
        });
      }

      if (storedOtp !== String(otp)) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }

      // OTP valid — update mobile and clear OTP fields
      db.query(
        "UPDATE eventUsers SET mobileNumber = ?, otp = NULL, otp_expiry = NULL, updated_at = NOW() WHERE id = ?",
        [newMobile, userId],
        (err2, result) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: "Database error" });
          return res.status(200).json({
            success: true,
            message: "Mobile number updated successfully",
          });
        },
      );
    },
  );
};
